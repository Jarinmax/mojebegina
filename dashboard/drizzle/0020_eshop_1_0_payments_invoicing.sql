-- ESHOP 1.0 — platby a fakturace (VYGENEROVÁNO scripts/eshop-payments/build-drizzle.mjs).
-- = docs/eshop-payments/11_migration.sql (krok A) + 21_migration.sql (krok B).
-- ===== 1. Platební identifikátor objednávky (VS) =====
-- 8 číslic začínajících 7 (70000001, 70000002, …), přiděluje pokladna při
-- uložení objednávky: '7' || lpad(nextval('payment_vs_seq')::text, 7, '0').
CREATE SEQUENCE payment_vs_seq START 1 MINVALUE 1 MAXVALUE 9999999 NO CYCLE;
ALTER TABLE orders ADD COLUMN payment_vs text;
ALTER TABLE orders ADD CONSTRAINT orders_payment_vs_key UNIQUE (payment_vs);
ALTER TABLE orders ADD CONSTRAINT orders_payment_vs_format
  CHECK (payment_vs IS NULL OR payment_vs ~ '^7[0-9]{7}$');

-- VS je neměnný: jednou nastavený nejde přepsat ani smazat.
CREATE FUNCTION orders_payment_vs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.payment_vs IS NOT NULL AND NEW.payment_vs IS DISTINCT FROM OLD.payment_vs THEN
    RAISE EXCEPTION 'payment_vs je neměnný (objednávka %)', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_payment_vs_immutable BEFORE UPDATE OF payment_vs ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_payment_vs_immutable();

-- ===== 2. Platby: libovolný počet záznamů k objednávce =====
-- Jeden řádek = jedna transakce u jednoho zdroje. Směr peněz (direction)
-- a stav transakce (status) jsou dvě nezávislé veličiny; částka je vždy
-- kladná. Idempotence: UNIQUE (source, external_id).
CREATE TABLE payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 uuid REFERENCES orders(id),           -- NULL = přišlo, zatím nespárováno
  source                   text NOT NULL,                         -- 'stripe' | 'bank' | 'manual'
  external_id              text NOT NULL,                         -- ID u zdroje: cs_… / re_… / účet:ID pohybu / token formuláře
  method                   text NOT NULL,                         -- 'card' | 'bank_transfer' | 'cash'
  direction                text NOT NULL,                         -- 'inflow' = příjem | 'outflow' = vratka zákazníkovi
  status                   text NOT NULL,                         -- 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'superseded' | 'refunded'
  amount_hal               bigint NOT NULL,                       -- haléře, vždy > 0
  currency                 text NOT NULL DEFAULT 'CZK',
  vs                       text,                                  -- VS, se kterým peníze přišly / odešly
  refund_of_payment_id     uuid REFERENCES payments(id),          -- vratka → původní příjem
  superseded_by_payment_id uuid REFERENCES payments(id),          -- ruční potvrzení doložené importem banky
  match_status             text NOT NULL DEFAULT 'matched',       -- 'matched' | 'unmatched' | 'needs_review'
  occurred_at              timestamptz,                           -- kdy peníze skutečně přišly / odešly
  recorded_by_user_id      text,                                  -- kdo zapsal ruční záznam / párování
  note                     text,
  raw                      jsonb,                                 -- výřez ze Stripe / banky, NIKDY údaje o kartě
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_source_external_key UNIQUE (source, external_id),
  CONSTRAINT payments_source_check     CHECK (source IN ('stripe', 'bank', 'manual')),
  CONSTRAINT payments_method_check     CHECK (method IN ('card', 'bank_transfer', 'cash')),
  CONSTRAINT payments_direction_check  CHECK (direction IN ('inflow', 'outflow')),
  CONSTRAINT payments_status_check     CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled', 'superseded', 'refunded')),
  CONSTRAINT payments_match_check      CHECK (match_status IN ('matched', 'unmatched', 'needs_review')),
  CONSTRAINT payments_currency_czk     CHECK (currency = 'CZK'),
  CONSTRAINT payments_amount_positive  CHECK (amount_hal > 0),
  CONSTRAINT payments_matched_has_order CHECK (match_status <> 'matched' OR order_id IS NOT NULL),
  -- vratka je vždy odchozí; „refunded“ může být jen příjem, který byl celý vrácen
  CONSTRAINT payments_refund_is_outflow CHECK (refund_of_payment_id IS NULL OR direction = 'outflow'),
  CONSTRAINT payments_refunded_is_inflow CHECK (status <> 'refunded' OR direction = 'inflow'),
  -- „superseded“ právě tehdy, když je uvedeno, čím byl záznam nahrazen
  CONSTRAINT payments_superseded_has_link CHECK ((status = 'superseded') = (superseded_by_payment_id IS NOT NULL)),
  CONSTRAINT payments_not_self_superseded CHECK (superseded_by_payment_id IS DISTINCT FROM id),
  -- peníze, které se skutečně pohnuly, mají čas pohybu
  CONSTRAINT payments_settled_has_time CHECK (status NOT IN ('succeeded', 'superseded', 'refunded') OR occurred_at IS NOT NULL),
  CONSTRAINT payments_manual_has_user  CHECK (source <> 'manual' OR recorded_by_user_id IS NOT NULL),
  CONSTRAINT payments_vs_format        CHECK (vs IS NULL OR vs ~ '^[0-9]{1,10}$')
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE INDEX payments_vs_idx ON payments (vs);
CREATE INDEX payments_needs_attention_idx ON payments (created_at) WHERE match_status <> 'matched';

-- Stav úhrady objednávky — počítá se, neukládá se ručně.
-- Příjem se počítá, pokud peníze přišly (succeeded, nebo refunded = přišly
-- a později byly vráceny; vratka je pak samostatný odchozí řádek). Odchozí
-- vratka se odečte, jen když proběhla (succeeded). Pokusy (pending),
-- neúspěšné, zrušené a nahrazené záznamy se nepočítají nikdy.
CREATE VIEW order_payment_balance AS
WITH sums AS (
  SELECT o.id AS order_id,
         o.total_kc::bigint * 100 AS required_hal,
         coalesce(sum(p.amount_hal) FILTER (WHERE p.direction = 'inflow'  AND p.status IN ('succeeded', 'refunded')), 0)::bigint AS received_hal,
         coalesce(sum(p.amount_hal) FILTER (WHERE p.direction = 'outflow' AND p.status = 'succeeded'), 0)::bigint AS refunded_hal
  FROM orders o
  LEFT JOIN payments p ON p.order_id = o.id AND p.match_status = 'matched'
  GROUP BY o.id, o.total_kc
)
SELECT order_id, required_hal, received_hal, refunded_hal,
       received_hal - refunded_hal AS net_hal,
       CASE
         WHEN refunded_hal > 0 AND received_hal - refunded_hal <= 0 THEN 'refunded'
         WHEN received_hal - refunded_hal <= 0 THEN 'unpaid'
         WHEN received_hal - refunded_hal < required_hal THEN 'partially_paid'
         WHEN received_hal - refunded_hal = required_hal THEN 'paid'
         ELSE 'overpaid'
       END AS balance_state
FROM sums;

-- ===== 3. Zákazníci pro fakturaci a jejich kontakty u poskytovatelů =====
CREATE TABLE invoice_customers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL,                                 -- 'person' | 'company'
  email_normalized text,                                          -- lower(trim(e-mail))
  ico              text,                                          -- jen firma
  name             text NOT NULL,                                 -- poslední známé jméno / název
  organization_id  uuid REFERENCES organizations(id),             -- firma, kterou MojeBegina už zná
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_customers_kind_check CHECK (kind IN ('person', 'company')),
  CONSTRAINT invoice_customers_ico_format CHECK (ico IS NULL OR ico ~ '^[0-9]{8}$'),
  CONSTRAINT invoice_customers_person_by_email CHECK (kind <> 'person' OR (email_normalized IS NOT NULL AND ico IS NULL)),
  CONSTRAINT invoice_customers_company_key CHECK (kind <> 'company' OR ico IS NOT NULL OR email_normalized IS NOT NULL)
);
-- soukromá osoba: jeden zákazník na e-mail; firma: na IČO, firma bez IČO na e-mail
CREATE UNIQUE INDEX invoice_customers_person_email_key ON invoice_customers (email_normalized) WHERE kind = 'person';
CREATE UNIQUE INDEX invoice_customers_company_ico_key ON invoice_customers (ico) WHERE kind = 'company' AND ico IS NOT NULL;
CREATE UNIQUE INDEX invoice_customers_company_email_key ON invoice_customers (email_normalized) WHERE kind = 'company' AND ico IS NULL;

-- Kontakt zákazníka u poskytovatele (dnes iDoklad) — obecná vazba.
CREATE TABLE invoice_customer_refs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES invoice_customers(id),
  provider    text NOT NULL,                                      -- 'idoklad' (formát, ne pevný seznam)
  external_id text NOT NULL,                                      -- ID kontaktu u poskytovatele
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_customer_refs_provider_format CHECK (provider ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT invoice_customer_refs_external_key UNIQUE (provider, external_id),
  CONSTRAINT invoice_customer_refs_one_per_provider UNIQUE (customer_id, provider)
);

-- ===== 4. Faktury: prodejní faktura i budoucí dobropis =====
-- Stávající řádky (importované faktury) dostanou origin = 'import',
-- doc_state = 'issued', document_type = 'invoice' — beze změny obsahu.
ALTER TABLE invoices DROP CONSTRAINT invoices_order_id_unique;   -- nahrazuje částečný index níže
ALTER TABLE invoices
  ALTER COLUMN organization_id DROP NOT NULL,                    -- soukromý zákazník bez IČO
  ALTER COLUMN invoice_number DROP NOT NULL,                     -- číslo přidělí až poskytovatel
  ALTER COLUMN issued_at DROP NOT NULL,
  ALTER COLUMN status DROP NOT NULL;                             -- historický stav z importu; nový kód používá doc_state
ALTER TABLE invoices
  ADD COLUMN document_type       text NOT NULL DEFAULT 'invoice', -- 'invoice' | 'credit_note'
  ADD COLUMN corrects_invoice_id uuid REFERENCES invoices(id),    -- dobropis → opravovaná faktura
  ADD COLUMN origin              text NOT NULL DEFAULT 'import',  -- 'eshop' | 'import' | 'manual'
  ADD COLUMN doc_state           text NOT NULL DEFAULT 'issued',  -- 'draft' | 'issued' | 'void'
  ADD COLUMN payment_vs          text,                            -- = orders.payment_vs
  ADD COLUMN customer_id         uuid REFERENCES invoice_customers(id),
  ADD COLUMN pdf_sent_at         timestamptz,                     -- kdy MojeBegina poslala PDF zákazníkovi
  ADD COLUMN updated_at          timestamptz NOT NULL DEFAULT now();
-- výchozí hodnoty platí jen pro stávající řádky; nový kód je uvádí vždy
ALTER TABLE invoices ALTER COLUMN origin DROP DEFAULT, ALTER COLUMN doc_state SET DEFAULT 'draft';
ALTER TABLE invoices ADD CONSTRAINT invoices_document_type_check CHECK (document_type IN ('invoice', 'credit_note'));
ALTER TABLE invoices ADD CONSTRAINT invoices_origin_check CHECK (origin IN ('eshop', 'import', 'manual'));
ALTER TABLE invoices ADD CONSTRAINT invoices_doc_state_check CHECK (doc_state IN ('draft', 'issued', 'void'));
ALTER TABLE invoices ADD CONSTRAINT invoices_credit_note_has_origin
  CHECK ((document_type = 'credit_note') = (corrects_invoice_id IS NOT NULL));
ALTER TABLE invoices ADD CONSTRAINT invoices_issued_has_number
  CHECK (doc_state <> 'issued' OR (invoice_number IS NOT NULL AND issued_at IS NOT NULL));
-- jedna ostrá prodejní faktura na objednávku; dobropisů může být víc
CREATE UNIQUE INDEX invoices_one_sales_invoice_per_order
  ON invoices (order_id) WHERE document_type = 'invoice' AND doc_state <> 'void';
CREATE INDEX invoices_order_idx ON invoices (order_id);

-- ===== 5. Obecná vazba dokladu na externího poskytovatele =====
-- Dnes iDoklad; jiný poskytovatel = jen jiná hodnota provider. Historie
-- pokusů zůstává (nepovedený / zrušený pokus = state 'void'), aktivní
-- vazba je na doklad nejvýš jedna.
CREATE TABLE invoice_provider_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoices(id),
  provider        text NOT NULL,                                  -- 'idoklad'
  state           text NOT NULL DEFAULT 'pending',                -- 'pending' | 'dry_run' | 'issued' | 'failed' | 'void'
  external_id     text,                                           -- ID dokladu u poskytovatele
  external_number text,                                           -- číslo dokladu z řady poskytovatele
  number_series   text,                                           -- řada (u iDokladu e-shopová), pro audit
  issued_at       timestamptz,                                    -- datum vystavení podle poskytovatele
  external_url    text,                                           -- odkaz na doklad u poskytovatele
  pdf_storage_key text,                                           -- kde máme uložené PDF
  pdf_sha256      text,
  pdf_fetched_at  timestamptz,
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,                                           -- očištěná chyba, bez tokenů
  last_error_at   timestamptz,
  next_attempt_at timestamptz,
  request_payload jsonb,                                          -- co jsme poslali / poslali bychom (dry-run)
  response_ref    jsonb,                                          -- reference z odpovědi (bez tajných údajů)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_provider_links_provider_format CHECK (provider ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT invoice_provider_links_state_check CHECK (state IN ('pending', 'dry_run', 'issued', 'failed', 'void')),
  CONSTRAINT invoice_provider_links_issued_complete
    CHECK (state <> 'issued' OR (external_id IS NOT NULL AND external_number IS NOT NULL AND issued_at IS NOT NULL)),
  CONSTRAINT invoice_provider_links_failed_has_error CHECK (state <> 'failed' OR last_error IS NOT NULL),
  CONSTRAINT invoice_provider_links_attempts_nonnegative CHECK (attempts >= 0)
);
CREATE UNIQUE INDEX invoice_provider_links_one_active ON invoice_provider_links (invoice_id) WHERE state <> 'void';
CREATE UNIQUE INDEX invoice_provider_links_external_id_key ON invoice_provider_links (provider, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX invoice_provider_links_external_number_key ON invoice_provider_links (provider, external_number) WHERE external_number IS NOT NULL;
CREATE INDEX invoice_provider_links_retry_idx ON invoice_provider_links (next_attempt_at) WHERE state IN ('pending', 'failed');
--> statement-breakpoint
-- 1. Starší e-shopové objednávky bez VS dostanou VS z řady, v pořadí,
--    v jakém vznikly (na Preview jen testovací objednávky).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM orders WHERE channel = 'eshop' AND payment_vs IS NULL ORDER BY ordered_at, created_at, id LOOP
    UPDATE orders SET payment_vs = '7' || lpad(nextval('payment_vs_seq')::text, 7, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- 2. E-shopová objednávka bez VS už nevznikne.
ALTER TABLE orders ADD CONSTRAINT orders_eshop_requires_vs
  CHECK (channel <> 'eshop' OR payment_vs IS NOT NULL);

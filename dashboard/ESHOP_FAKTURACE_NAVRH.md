# ESHOP 1.0 — fakturace přes iDoklad: finální schéma k odsouhlasení

Stav: **NÁVRH v2 (5. 10. 2026), nic z toho neběží.** Žádná migrace, žádný
zápis do Production DB ani do iDokladu, žádné živé vystavování faktur.
Směr schválil Jaroslav Viner 5. 10. 2026 (varianta A z `ESHOP_PREVOD_QR.md`)
s úpravou: **více plateb na jednu objednávku** a faktura, která do budoucna
**neblokuje dobropis**. Read-only test iDokladu (`feature/finance-1-0`):
agenda Jaroslav Viner, IČO 74337297, neplátce DPH, API v3 odpovídá.

## 0. Rozhodnutí vedení (5. 10. 2026)

| # | Rozhodnutí |
|---|---|
| 1 | **VS:** vlastní 8místná řada začínající 7 (`70000001`, `70000002`…). Vzniká při objednávce, je unikátní, **nikdy se nemění**. |
| 2 | **Číselná řada faktur:** samostatná řada pro e-shop **v iDokladu**, oddělená od B2B. Čísla přiděluje iDoklad, MojeBegina je negeneruje. |
| 3 | **DPH:** Begina je neplátce DPH (potvrzeno i iDokladem). |
| 4 | **Kontakty v iDokladu:** skuteční zákazníci, žádný společný kontakt. Soukromá osoba podle e-mailu; firma podle IČO, jinak podle e-mailu. |
| 5 | **Faktura zákazníkovi:** PDF posílá MojeBegina jako součást / návaznost e-mailu „Platbu jsme přijali“. **Žádný e-mail z iDokladu.** |
| 6 | **WooCommerce plugin pro iDoklad:** vypne se až po ostrém přepnutí na nový e-shop a ověření fakturace. **Před finálním přepnutím nevypínat.** |
| 7 | **Platby:** víc záznamů na objednávku (pokus Stripe, převod, ruční potvrzení, import banky, částečná úhrada, doplatek, vratka). Každá externí transakce idempotentní podle ID zdroje. „Zaplaceno“ až po úhradě **celé** částky. |
| 8 | **Faktury:** jedna ostrá prodejní faktura na objednávku; schéma nesmí blokovat dobropis / opravný doklad. |

## 1. Princip

| Věc | Identifikátor | Kdo ho určuje | Kdy |
|---|---|---|---|
| Objednávka | `orders.order_number` | řada `order_number_seq` (dnes) | odeslání objednávky |
| Platební identifikátor | `orders.payment_vs` | řada `payment_vs_seq` (`7xxxxxxx`) | odeslání objednávky, **neměnný** |
| Platba (0…n na objednávku) | `payments.source` + `payments.external_id` | Stripe / banka / formulář | každý pokus, příjem, vratka |
| Faktura / dobropis | číslo dokladu | **iDoklad** (e-shopová řada) | po úhradě celé částky / při opravě |

## 2. Schéma (SQL k odsouhlasení — NESPOUŠTĚT)

### 2.1 `orders.payment_vs`

```sql
CREATE SEQUENCE payment_vs_seq START 1 MAXVALUE 9999999 NO CYCLE;
ALTER TABLE orders ADD COLUMN payment_vs text;
ALTER TABLE orders ADD CONSTRAINT orders_payment_vs_key UNIQUE (payment_vs);
ALTER TABLE orders ADD CONSTRAINT orders_payment_vs_format
  CHECK (payment_vs IS NULL OR payment_vs ~ '^7[0-9]{7}$');
ALTER TABLE orders ADD CONSTRAINT orders_eshop_requires_vs
  CHECK (channel <> 'eshop' OR payment_vs IS NOT NULL) NOT VALID;

-- VS je neměnný: jakmile je nastaven, nejde přepsat ani smazat
CREATE FUNCTION orders_payment_vs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.payment_vs IS NOT NULL AND NEW.payment_vs IS DISTINCT FROM OLD.payment_vs THEN
    RAISE EXCEPTION 'payment_vs je neměnný (objednávka %)', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_payment_vs_immutable BEFORE UPDATE OF payment_vs ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_payment_vs_immutable();
```

- Hodnotu přidělí pokladna v **tomtéž INSERTu** jako objednávku:
  `'7' || lpad(nextval('payment_vs_seq')::text, 7, '0')`. QR (`X-VS`),
  e-mail i stránka objednávky ji jen čtou; dnešní dopočet VS z čísla
  objednávky (`bankTransfer.ts`) zmizí.
- Řada `7xxxxxxx` se nepotká s VS faktur B2B (`2026xxxx`) ani s čísly
  objednávek WooCommerce → spolehlivé párování banky.
- **Stávající objednávky:** Production e-shop ještě neběží → nic. Na
  Preview je 6 testovacích e-shopových objednávek (900001–900007); dostanou
  nové VS z řady (testovací data, žádný skutečný zákazník podle nich
  neplatí). Pak `VALIDATE CONSTRAINT orders_eshop_requires_vs`.

### 2.2 `payments` — libovolný počet platebních záznamů k objednávce

Jeden řádek = jedna transakce u jednoho zdroje (pokus Stripe, příchozí
převod, ruční potvrzení, vratka). **Žádné omezení „jedna platba na
objednávku“.**

```sql
CREATE TABLE payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid REFERENCES orders(id),   -- NULL = přišlo, ale zatím nespárováno (banka)
  source               text NOT NULL,                 -- 'stripe' | 'bank' | 'manual'
  external_id          text NOT NULL,                 -- unikátní ID u zdroje (viz tabulka níže)
  method               text NOT NULL,                 -- 'card' | 'bank_transfer' | 'cash'
  direction            text NOT NULL DEFAULT 'in',    -- 'in' = příjem, 'out' = vratka zákazníkovi
  status               text NOT NULL,                 -- 'pending' | 'succeeded' | 'failed' | 'cancelled'
  amount_hal           bigint NOT NULL,               -- vždy kladná, haléře; směr určuje direction
  currency             text NOT NULL DEFAULT 'CZK',
  vs                   text,                          -- VS, se kterým peníze přišly / odešly
  refund_of_payment_id uuid REFERENCES payments(id),  -- vratka → původní příjem
  superseded_by_payment_id uuid REFERENCES payments(id), -- ruční potvrzení, které později doložil import banky
  match_status         text NOT NULL DEFAULT 'matched', -- 'matched' | 'unmatched' | 'needs_review'
  occurred_at          timestamptz,                   -- kdy peníze skutečně přišly/odešly (u pending NULL)
  recorded_by_user_id  text,                          -- kdo zapsal ruční záznam / párování
  note                 text,
  raw                  jsonb,                         -- výřez ze Stripe/banky, NIKDY údaje o kartě
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_source_external_key UNIQUE (source, external_id),
  CONSTRAINT payments_source_check    CHECK (source IN ('stripe','bank','manual')),
  CONSTRAINT payments_method_check    CHECK (method IN ('card','bank_transfer','cash')),
  CONSTRAINT payments_direction_check CHECK (direction IN ('in','out')),
  CONSTRAINT payments_status_check    CHECK (status IN ('pending','succeeded','failed','cancelled')),
  CONSTRAINT payments_match_check     CHECK (match_status IN ('matched','unmatched','needs_review')),
  CONSTRAINT payments_currency_czk    CHECK (currency = 'CZK'),
  CONSTRAINT payments_amount_positive CHECK (amount_hal > 0),
  CONSTRAINT payments_matched_has_order CHECK (match_status <> 'matched' OR order_id IS NOT NULL),
  CONSTRAINT payments_refund_is_out   CHECK (refund_of_payment_id IS NULL OR direction = 'out'),
  CONSTRAINT payments_succeeded_has_time CHECK (status <> 'succeeded' OR occurred_at IS NOT NULL),
  CONSTRAINT payments_manual_has_user CHECK (source <> 'manual' OR recorded_by_user_id IS NOT NULL),
  CONSTRAINT payments_not_self_superseded CHECK (superseded_by_payment_id IS DISTINCT FROM id)
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE INDEX payments_vs_idx ON payments (vs);
CREATE INDEX payments_unmatched_idx ON payments (created_at) WHERE match_status <> 'matched';
```

**Idempotence — co je `external_id` u jednotlivých zdrojů:**

| Situace | source | external_id | Poznámka |
|---|---|---|---|
| Pokus o platbu kartou | `stripe` | ID Checkout Session `cs_…` | vznikne `pending` při přesměrování; webhook ho přepne na `succeeded` / `failed` / `cancelled` (vypršení) |
| Vratka kartou | `stripe` | ID refundu `re_…` | `direction = out`, `refund_of_payment_id` → původní platba |
| Ruční potvrzení „Zaplaceno“ / ruční vratka | `manual` | jednorázový token formuláře (UUID) | dvojklik ani opakované odeslání nezapíše dvě platby |
| Budoucí import banky | `bank` | `<číslo účtu>:<ID pohybu z banky>` | stejný pohyb z opakovaného importu se nezapíše znovu |

Opakovaný webhook / import = `INSERT … ON CONFLICT (source, external_id)
DO UPDATE` jen u změny stavu (`pending → succeeded`), nikdy druhý řádek.

**Kdy je objednávka zaplacená** (počítá se, neukládá se ručně):

```sql
CREATE VIEW order_payment_balance AS
SELECT o.id AS order_id,
       o.total_kc * 100 AS required_hal,
       coalesce(sum(p.amount_hal) FILTER (WHERE p.direction = 'in'),  0) AS received_hal,
       coalesce(sum(p.amount_hal) FILTER (WHERE p.direction = 'out'), 0) AS refunded_hal,
       coalesce(sum(CASE p.direction WHEN 'in' THEN p.amount_hal ELSE -p.amount_hal END), 0) AS net_hal,
       CASE
         WHEN coalesce(sum(p.amount_hal) FILTER (WHERE p.direction = 'out'), 0) > 0
              AND coalesce(sum(CASE p.direction WHEN 'in' THEN p.amount_hal ELSE -p.amount_hal END), 0) <= 0
           THEN 'refunded'
         WHEN coalesce(sum(CASE p.direction WHEN 'in' THEN p.amount_hal ELSE -p.amount_hal END), 0) <= 0 THEN 'unpaid'
         WHEN coalesce(sum(CASE p.direction WHEN 'in' THEN p.amount_hal ELSE -p.amount_hal END), 0) < o.total_kc * 100 THEN 'partially_paid'
         WHEN coalesce(sum(CASE p.direction WHEN 'in' THEN p.amount_hal ELSE -p.amount_hal END), 0) = o.total_kc * 100 THEN 'paid'
         ELSE 'overpaid'
       END AS balance_state
FROM orders o
LEFT JOIN payments p
  ON p.order_id = o.id
 AND p.status = 'succeeded'
 AND p.match_status = 'matched'
 AND p.superseded_by_payment_id IS NULL
GROUP BY o.id, o.total_kc;
```

- Počítají se jen **úspěšné, spárované, nenahrazené** záznamy. Pokusy
  (`pending`), neúspěšné a zrušené platby se evidují, ale nic nezaplatí.
- **Zaplaceno = `paid` nebo `overpaid`** (přijatá čistá částka ≥ požadovaná).
  Částečná úhrada (`partially_paid`) zaplaceno **není** — doplatek je další
  řádek v `payments`, po něm se stav přepočítá. Přeplatek se ukáže
  v MojeBegina jako „k vrácení“.
- `orders.payment_status` a `orders.paid_at` zůstávají jako **souhrn pro
  obrazovky** (stávající hodnoty `unpaid` / `invoiced` / `paid` — kód
  v `main` je zná). U e-shopových objednávek je nastavuje výhradně
  přepočet z `order_payment_balance` ve **stejné transakci** jako zápis
  platby: `paid`, pokud je stav `paid` / `overpaid`, jinak `unpaid`.
  Podrobný stav (částečně, přeplaceno, vráceno) čte MojeBegina z pohledu.
  Ruční přepínání „Zaplaceno“ v MojeBegina se u e-shopu změní na **zápis
  ruční platby** (částka, datum, kdo) — ne na přepnutí stavu.
- **Ruční potvrzení + pozdější import banky:** když import banky najde
  stejnou platbu, kterou už někdo potvrdil ručně (stejný VS a částka),
  ruční řádek dostane `superseded_by_payment_id` → peníze se nezapočítají
  dvakrát a zůstane doklad, kdo co kdy potvrdil.
- **Jedna platba za víc objednávek** (B2B zaplatí dvě faktury jedním
  převodem) se v e-shopu V1 neřeší; banka ji zapíše jako `needs_review`.
  Do budoucna jde doplnit tabulka rozpadu `payment_allocations` bez změny
  `payments`.

### 2.3 `invoices` — prodejní faktura i budoucí dobropis

Rozšíření stávající tabulky. Na Preview jsou v ní jen 2 importované
faktury The Cup (20260152, 20260153) — zůstanou beze změny
(`provider = 'import'`, `document_type = 'invoice'`).

```sql
ALTER TABLE invoices DROP CONSTRAINT invoices_order_id_unique;      -- nahrazuje částečný index níže
ALTER TABLE invoices ALTER COLUMN organization_id DROP NOT NULL;   -- soukromý zákazník bez IČO
ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;    -- číslo přidělí až iDoklad
ALTER TABLE invoices ALTER COLUMN issued_at DROP NOT NULL;
ALTER TABLE invoices
  ADD COLUMN document_type        text NOT NULL DEFAULT 'invoice',    -- 'invoice' | 'credit_note'
  ADD COLUMN corrects_invoice_id  uuid REFERENCES invoices(id),       -- dobropis → opravovaná faktura
  ADD COLUMN provider             text NOT NULL DEFAULT 'import',     -- 'idoklad' | 'import' | 'manual'
  ADD COLUMN payment_vs           text,                               -- = orders.payment_vs
  ADD COLUMN issue_state          text NOT NULL DEFAULT 'issued',     -- 'pending' | 'issued' | 'failed' | 'dry_run' | 'void'
  ADD COLUMN issue_attempts       integer NOT NULL DEFAULT 0,
  ADD COLUMN last_error           text,                               -- očištěná chyba, bez tokenů
  ADD COLUMN number_series        text,                               -- název/ID e-shopové řady v iDokladu (audit)
  ADD COLUMN customer_id          uuid,                               -- → invoice_customers (FK níže)
  ADD COLUMN request_payload      jsonb,                              -- co jsme poslali / poslali bychom (dry-run)
  ADD COLUMN pdf_sent_at          timestamptz,                        -- kdy MojeBegina poslala PDF zákazníkovi
  ADD COLUMN updated_at           timestamptz NOT NULL DEFAULT now();
ALTER TABLE invoices ADD CONSTRAINT invoices_document_type_check
  CHECK (document_type IN ('invoice','credit_note'));
ALTER TABLE invoices ADD CONSTRAINT invoices_provider_check
  CHECK (provider IN ('idoklad','import','manual'));
ALTER TABLE invoices ADD CONSTRAINT invoices_issue_state_check
  CHECK (issue_state IN ('pending','issued','failed','dry_run','void'));
ALTER TABLE invoices ADD CONSTRAINT invoices_credit_note_has_origin
  CHECK ((document_type = 'credit_note') = (corrects_invoice_id IS NOT NULL));
ALTER TABLE invoices ADD CONSTRAINT invoices_issued_has_number
  CHECK (issue_state <> 'issued' OR (invoice_number IS NOT NULL AND issued_at IS NOT NULL));
-- jedna ostrá prodejní faktura na objednávku (dobropisů může být víc)
CREATE UNIQUE INDEX invoices_one_sales_invoice_per_order
  ON invoices (order_id) WHERE document_type = 'invoice' AND issue_state <> 'void';
-- číslo dokladu unikátní v rámci zdroje
CREATE UNIQUE INDEX invoices_provider_number_key
  ON invoices (provider, invoice_number) WHERE invoice_number IS NOT NULL;
-- jeden doklad iDokladu = jeden řádek
CREATE UNIQUE INDEX invoices_external_id_key
  ON invoices (provider, external_edoklad_id) WHERE external_edoklad_id IS NOT NULL;
```

- **Prodejní faktura:** max. jedna na objednávku (ne-`void`). `void` je
  jen pro neodeslaný pokus (např. `dry_run` / `failed` před vystavením),
  ostrou fakturu nikdy nemažeme ani nepřepisujeme — opravuje se
  dobropisem.
- **Dobropis / opravný doklad** (V1 neimplementuje, schéma ho unese):
  řádek `document_type = 'credit_note'`, `corrects_invoice_id` → faktura,
  `total_kc` záporně, vlastní číslo z iDokladu. Vratka peněz je zvlášť
  v `payments` (`direction = out`).
- `external_edoklad_id` se nepřejmenovává (čte ho kód v `main`) — nese
  ID dokladu v iDokladu.
- ⚠ Dnešní `getCustomerOrders` (`lib/data/dashboard.ts`) spojuje
  objednávky s `invoices` bez filtru — se zavedením dobropisů musí spojení
  brát jen `document_type = 'invoice'` (jinak by se objednávka zobrazila
  dvakrát). Upraví se ve stejném kroku jako migrace; dokud dobropisy
  nevzniknou, chování se nemění.

### 2.4 `invoice_customers` — zákazníci a jejich kontakty v iDokladu

```sql
CREATE TABLE invoice_customers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 text NOT NULL,                  -- 'person' | 'company'
  email_normalized     text,                           -- lower(trim(email))
  ico                  text,                           -- jen firma, 8 číslic
  name                 text NOT NULL,                  -- jméno / název firmy (poslední známý)
  organization_id      uuid REFERENCES organizations(id), -- firma, kterou už MojeBegina zná
  idoklad_contact_id   text,                           -- ID kontaktu v iDokladu (NULL = ještě nezaložen)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_customers_kind_check CHECK (kind IN ('person','company')),
  CONSTRAINT invoice_customers_ico_format CHECK (ico IS NULL OR ico ~ '^[0-9]{8}$'),
  CONSTRAINT invoice_customers_person_by_email CHECK (kind <> 'person' OR (email_normalized IS NOT NULL AND ico IS NULL)),
  CONSTRAINT invoice_customers_company_key CHECK (kind <> 'company' OR ico IS NOT NULL OR email_normalized IS NOT NULL)
);
-- soukromá osoba: jeden zákazník na e-mail
CREATE UNIQUE INDEX invoice_customers_person_email_key
  ON invoice_customers (email_normalized) WHERE kind = 'person';
-- firma: primárně jedna na IČO, firma bez IČO jedna na e-mail
CREATE UNIQUE INDEX invoice_customers_company_ico_key
  ON invoice_customers (ico) WHERE kind = 'company' AND ico IS NOT NULL;
CREATE UNIQUE INDEX invoice_customers_company_email_key
  ON invoice_customers (email_normalized) WHERE kind = 'company' AND ico IS NULL;
CREATE UNIQUE INDEX invoice_customers_idoklad_key
  ON invoice_customers (idoklad_contact_id) WHERE idoklad_contact_id IS NOT NULL;
ALTER TABLE invoices ADD CONSTRAINT invoices_customer_fk
  FOREIGN KEY (customer_id) REFERENCES invoice_customers(id);
```

- **Deduplikace:** firma (objednávka s IČO) → podle IČO, bez IČO podle
  e-mailu; soukromá osoba → podle e-mailu. Žádný společný kontakt.
- Než se kontakt v iDokladu založí, MojeBegina ho tam **vyhledá** (GET
  podle IČO / e-mailu) — B2B firmy, které už v iDokladu jsou, se znovu
  nezakládají; uloží se jen jejich `idoklad_contact_id`.
- Fakturační údaje (jméno, adresa) jdou na fakturu ze **snapshotu
  objednávky** — změna adresy u zákazníka nezmění starou fakturu.

## 3. Workflow

```
Objednávka (checkout)
  └─ INSERT orders: order_number + payment_vs (7xxxxxxx)
     └─ QR / e-mail / stránka: VS = payment_vs, datum v QR = den objednávky

Platba (libovolně mnoho záznamů)
  ├─ karta: přesměrování → payments(stripe, cs_…, pending)
  │         webhook → stejný řádek succeeded / failed / cancelled
  ├─ převod (V1): MojeBegina „Zapsat platbu“ → payments(manual, token formuláře, succeeded)
  ├─ převod (později): import banky → payments(bank, účet:ID pohybu) → párování VS + částka
  └─ vratka: payments(…, direction = out, refund_of_payment_id)
  → VE STEJNÉ TRANSAKCI: přepočet order_payment_balance
       paid/overpaid  → orders.payment_status = paid, paid_at,
                        order_activity „Zaplaceno“,
                        invoices(invoice, pending) — jen pokud ještě neexistuje
       partially_paid → aktivita „Částečná úhrada X Kč, zbývá Y Kč“

Vystavení faktury (samostatný krok, opakovatelný; cron + tlačítko „Vystavit znovu“)
  1. invoice_customers: najít podle IČO / e-mailu, jinak vyhledat v iDokladu,
     jinak založit kontakt v iDokladu
  2. POJISTKA: GET IssuedInvoices s VS = payment_vs → už existuje? jen uložit číslo a ID
  3. POST IssuedInvoices: e-shopová řada, neplátce DPH, VS = payment_vs,
     datum vystavení = den úhrady, položky = snapshot order_items + doprava,
     štítek „E-shop“, BEZ odeslání e-mailu z iDokladu
  4. označit jako uhrazenou (FullyPay — přesnou cestu ověřit v oficiálním SDK)
  5. uložit číslo a ID → issue_state = issued
  6. stáhnout PDF z iDokladu → e-mail „Platbu jsme přijali“ s PDF → pdf_sent_at

Chyba v 1–6 → issue_state = failed, last_error, další pokus později.
Objednávka zůstává zaplacená; platba se zapíše vždy, i když iDoklad neodpovídá.
```

- **E-mail „Platbu jsme přijali“:** odejde až s PDF faktury (vystavení
  běží hned po platbě, obvykle za pár sekund). Když faktura do ~10 minut
  nevznikne, odejde potvrzení platby bez PDF a faktura dorazí v navazujícím
  e-mailu „Faktura k objednávce …“ z MojeBegina. Z iDokladu nic.
- Vystavení **neběží uvnitř webhooku ani pokladny**. Jeden běh na fakturu
  naráz (`SELECT … FOR UPDATE SKIP LOCKED`).

## 4. Bezpečnost zápisu do iDokladu

- Klient Finance (`feature/finance-1-0`) zůstává **jen pro čtení**.
  Fakturace dostane vlastní modul s vlastní pojistkou: povolené jen
  vyhledání a založení kontaktu, vystavení faktury, označení úhrady
  a stažení PDF. Žádné mazání, úpravy, odesílání e-mailů z iDokladu.
- Vypínač `IDOKLAD_INVOICING_ENABLED` (+ ID e-shopové řady
  `IDOKLAD_ESHOP_SEQUENCE_ID`): bez něj jen **dry-run** — sestaví a uloží
  návrh faktury (`issue_state = dry_run`, `request_payload`), nic
  neodešle. **Na Preview vždy dry-run** (jediná agenda je ostrá agenda
  Beginy). Production až po samostatném schválení.
- Pojistka agendy: zapisovat jen do agendy s IČO 74337297 a režimem DPH
  „neplátce“; jinak nic.
- Token pro běh bez člověka (refresh token, `offline_access`, šifrovaně
  v DB) — společné rozhodnutí s Finance, řeší se jednou pro obojí.

## 5. Pořadí implementace (po schválení schématu)

1. Migrace: `payment_vs`, `payments`, pohled `order_payment_balance`,
   rozšíření `invoices`, `invoice_customers` (skripty před / migrace / po /
   rollback; Preview spouští vedení ručně, Production až po schválení).
2. Pokladna a QR na `payment_vs`; Stripe zapisuje pokusy a výsledky do
   `payments`; ruční „Zapsat platbu“ v MojeBegina; přepočet stavu.
3. Modul vystavení faktury v režimu dry-run + v detailu objednávky
   „Platby“ a „Faktura: čeká / vystavena č. … / chyba“.
4. Testy nad falešným iDokladem: dvojí webhook, částečná úhrada
   + doplatek, přeplatek, vratka, ruční potvrzení + import banky, výpadek
   po POST, opakování, deduplikace kontaktů.
5. Samostatné schválení ostrého vystavování; po ověření a finálním
   přepnutí e-shopu vypnout WooCommerce plugin pro iDoklad.

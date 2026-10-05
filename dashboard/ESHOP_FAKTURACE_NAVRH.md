# ESHOP 1.0 — fakturace přes iDoklad: návrh k odsouhlasení

Stav: **NÁVRH, nic z toho neběží.** Žádná migrace, žádný zápis do
Production DB ani do iDokladu, žádné živé vystavování faktur. Navazuje na
rozhodnutí vedení z 3. 10. 2026 (varianta A, `ESHOP_PREVOD_QR.md`)
a na read-only test iDokladu z 5. 10. 2026 (`feature/finance-1-0`:
agenda Jaroslav Viner, IČO 74337297, API v3 odpovídá).

## 1. Princip

Tři oddělené věci se třemi vlastními čísly, propojené jedním VS:

| Věc | Číslo | Kdo ho určuje | Kdy vzniká |
|---|---|---|---|
| Objednávka | `orders.order_number` (dnes) | naše řada `order_number_seq` | při odeslání objednávky |
| Platební identifikátor | **`orders.payment_vs`** (nové) | naše řada `payment_vs_seq` | při odeslání objednávky, **nikdy se nemění** |
| Platba | `payments.id` + ID transakce (Stripe / banka) | Stripe / banka / člověk | když peníze přijdou |
| Faktura | číslo dokladu z iDokladu | **iDoklad** (jeho číselná řada) | po potvrzení platby |

Zákazník platí s `payment_vs`; stejný VS nese faktura v iDokladu. Platba
↔ objednávka ↔ faktura jsou tak jednoznačně dohledatelné i v bance,
i v iDokladu, i v MojeBegina.

## 2. Schéma (návrh SQL — NESPOUŠTĚT, migrace vznikne až po schválení)

### 2.1 `orders.payment_vs`

```sql
CREATE SEQUENCE payment_vs_seq START 1;
ALTER TABLE orders ADD COLUMN payment_vs text;
CREATE UNIQUE INDEX orders_payment_vs_key ON orders (payment_vs);
ALTER TABLE orders ADD CONSTRAINT orders_payment_vs_format
  CHECK (payment_vs IS NULL OR payment_vs ~ '^[0-9]{1,10}$');
-- e-shopová objednávka bez VS nevznikne (ruční a importované ho mít nemusí)
ALTER TABLE orders ADD CONSTRAINT orders_eshop_requires_vs
  CHECK (channel <> 'eshop' OR payment_vs IS NOT NULL) NOT VALID;
```

- **Formát (k odsouhlasení): 8 číslic začínajících 7**, např. `70000001`
  (`'7' || lpad(nextval('payment_vs_seq')::text, 7, '0')`). Důvod: nesmí
  se potkat s VS, které už do banky chodí — čísla faktur B2B (`2026xxxx`)
  a čísla objednávek WooCommerce. Pozdější automatické párování banky
  podle VS by jinak mohlo přiřadit platbu špatně.
- VS se generuje v **tomtéž INSERTu** jako objednávka (`orderWrite.ts`),
  QR (SPAYD `X-VS`), e-mail a stránka objednávky ho jen čtou. Dnešní
  dopočet VS z čísla objednávky (`bankTransfer.ts`) zmizí.
- **Stávající objednávky:** e-shopové objednávky s číslem dostanou
  `payment_vs = order_number` (zákazníci už platili s tímto VS). Na
  Preview je to 6 objednávek (900001–900007), v Production e-shop ještě
  neběží → nic. `NOT VALID` + `VALIDATE` až po doplnění.

### 2.2 `payments` (přijaté platby)

```sql
CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid REFERENCES orders(id),     -- NULL = zatím nespárovaná (banka)
  source             text NOT NULL,                   -- 'stripe' | 'bank' | 'manual'
  method             text NOT NULL,                   -- 'card' | 'bank_transfer' | 'cash'
  external_id        text,                            -- Stripe PaymentIntent / ID bankovní transakce
  amount_hal         bigint NOT NULL,                 -- haléře (banka umí 379,50 Kč)
  currency           text NOT NULL DEFAULT 'CZK',
  vs                 text,                            -- VS, se kterým peníze přišly
  received_at        timestamptz NOT NULL,
  match_status       text NOT NULL,                   -- 'matched' | 'unmatched' | 'amount_mismatch' | 'duplicate'
  recorded_by_user_id text,                           -- u ručního „Zaplaceno“
  note               text,
  raw                jsonb,                           -- výřez z banky/Stripe, NIKDY údaje o kartě
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_source_check CHECK (source IN ('stripe','bank','manual')),
  CONSTRAINT payments_method_check CHECK (method IN ('card','bank_transfer','cash')),
  CONSTRAINT payments_match_check CHECK (match_status IN ('matched','unmatched','amount_mismatch','duplicate')),
  CONSTRAINT payments_amount_positive CHECK (amount_hal > 0),
  CONSTRAINT payments_matched_has_order CHECK (match_status = 'unmatched' OR order_id IS NOT NULL),
  CONSTRAINT payments_manual_has_user CHECK (source <> 'manual' OR recorded_by_user_id IS NOT NULL)
);
-- stejná transakce se nezapíše dvakrát (opakovaný webhook, opakovaný import banky)
CREATE UNIQUE INDEX payments_source_external_key ON payments (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE INDEX payments_vs_idx ON payments (vs);
```

- `payments` je **jediný záznam „peníze přišly“**. `orders.payment_status`
  a `orders.paid_at` zůstávají jako souhrn pro obrazovky (mění se ve stejné
  transakci jako zápis platby).
- Objednávka je zaplacená, když součet `matched` plateb ≥ `total_kc`.
  Částečná platba / přeplatek → `amount_mismatch`, objednávka zůstane
  nezaplacená a v MojeBegina se ukáže k ručnímu vyřešení (jako dnes
  u Stripe `amount-mismatch`).

### 2.3 `invoices` — rozšířit stávající tabulku

Tabulka už existuje (objednávka → faktura, `external_edoklad_id`, splatnost
pro „po splatnosti“). Na Preview v ní jsou jen 2 importované faktury The
Cup (20260152, 20260153) — zůstanou beze změny jako `provider = 'import'`.

```sql
ALTER TABLE invoices ALTER COLUMN organization_id DROP NOT NULL;   -- soukromý zákazník bez IČO
ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;    -- číslo dá až iDoklad
ALTER TABLE invoices ALTER COLUMN issued_at DROP NOT NULL;
ALTER TABLE invoices ADD COLUMN provider text NOT NULL DEFAULT 'import';   -- 'idoklad' | 'import' | 'manual'
ALTER TABLE invoices ADD COLUMN payment_vs text;                   -- = orders.payment_vs
ALTER TABLE invoices ADD COLUMN payment_id uuid REFERENCES payments(id); -- platba, která fakturu spustila
ALTER TABLE invoices ADD COLUMN issue_state text NOT NULL DEFAULT 'issued'; -- 'pending' | 'issued' | 'failed' | 'dry_run'
ALTER TABLE invoices ADD COLUMN issue_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN last_error text;                   -- očištěná chyba (bez tokenů)
ALTER TABLE invoices ADD COLUMN external_partner_id text;          -- kontakt v iDokladu
ALTER TABLE invoices ADD COLUMN request_payload jsonb;             -- co jsme poslali / poslali bychom (dry-run)
ALTER TABLE invoices ADD COLUMN sent_to_customer_at timestamptz;
ALTER TABLE invoices ADD CONSTRAINT invoices_issue_state_check
  CHECK (issue_state IN ('pending','issued','failed','dry_run'));
ALTER TABLE invoices ADD CONSTRAINT invoices_issued_has_number
  CHECK (issue_state <> 'issued' OR (invoice_number IS NOT NULL AND issued_at IS NOT NULL));
CREATE UNIQUE INDEX invoices_provider_number_key ON invoices (provider, invoice_number) WHERE invoice_number IS NOT NULL;
```

- `order_id UNIQUE` zůstává: **jedna objednávka = jedna faktura** (V1).
  Storno/vrácení peněz = dobropis ručně v iDokladu (V1 ho neautomatizuje).
- `external_edoklad_id` se nepřejmenovává (kód v `main` ho čte) — nese ID
  dokladu v iDokladu.
- Finance (`fin_documents`) dál počítá **jen z dat synchronizovaných
  z iDokladu**; `invoices` je záznam „e-shop požádal o fakturu a dostal
  číslo“. Vazbu doklad ↔ objednávka (`fin_document_links`, kind `order`)
  vytvoří synchronizace Finance sama podle `external_edoklad_id`. Pravidlo
  D6 platí dál: objednávky ani `invoices` se do tržeb nepočítají.

## 3. Workflow

```
Objednávka (checkout)
  └─ INSERT orders: order_number + payment_vs (řady v DB)
     └─ QR / e-mail / stránka: VS = payment_vs, datum v QR = den objednávky
Platba přijde
  ├─ kartou: Stripe webhook → payments(source=stripe, external_id=PaymentIntent)
  ├─ převodem (V1): v MojeBegina „Zaplaceno“ → payments(source=manual, kdo, kdy, částka)
  └─ převodem (později): import banky → payments(source=bank) → párování VS + částka
     → v JEDNÉ transakci: orders.payment_status = paid, paid_at,
       order_activity „Zaplaceno“, invoices(issue_state = pending)
Vystavení faktury (samostatný krok, opakovatelný)
  1. najít/založit kontakt v iDokladu (e-mail; u firmy IČO)
  2. POJISTKA PROTI DVOJÍ FAKTUŘE: GET IssuedInvoices s filtrem VS = payment_vs
     → existuje? jen doplnit číslo a ID, nic nevystavovat
  3. POST IssuedInvoices: odběratel, VS = payment_vs, datum vystavení = den
     platby, položky = order_items (snapshot) + doprava, platba kartou/převodem,
     štítek „E-shop“ (segment Finance)
  4. označit jako uhrazenou (FullyPay) — peníze už máme
  5. uložit číslo dokladu a ID → issue_state = issued
  6. zákazníkovi: e-mail „Platbu jsme přijali“ + faktura (PDF z iDokladu)
Chyba v kroku 1–5 → issue_state = failed, last_error, pokus znovu (cron /
tlačítko „Vystavit znovu“ v MojeBegina); objednávka zůstává zaplacená.
```

- Vystavení **neběží uvnitř webhooku ani pokladny**: platba se zapíše
  vždy, i když iDoklad zrovna neodpovídá. Faktura se dožene.
- Idempotence: jedna faktura na objednávku (`invoices.order_id UNIQUE`),
  kontrola podle VS v iDokladu před každým POST, jeden běh na fakturu
  naráz (zámek řádku `FOR UPDATE SKIP LOCKED`).

## 4. Bezpečnost zápisu do iDokladu

Dnešní klient (`feature/finance-1-0`) je **záměrně jen pro čtení**
a zůstane tak. Fakturace dostane vlastní modul s vlastní pojistkou:

- povolené zápisy jen: založení kontaktu, vystavení faktury, označení
  faktury jako uhrazené (přesné cesty ověřit v oficiálním SDK
  Solitea/IdokladSdk před implementací); žádné mazání ani úpravy;
- vypínač `IDOKLAD_INVOICING_ENABLED`: bez něj se jen sestaví a uloží
  návrh faktury (`issue_state = dry_run`, `request_payload`) — **na
  Preview vždy dry-run**, protože jediná agenda je ostrá agenda Beginy;
- v Production zapnutí až po samostatném schválení (stejně jako Finance);
- token: Authorization Code potřebuje pro běh bez člověka refresh token
  (`offline_access`) uložený šifrovaně v DB — stejné rozhodnutí jako
  u synchronizace Finance, řešit jednou pro obojí.

## 5. Co potřebuji odsouhlasit

1. **Formát VS:** 8 číslic začínajících 7 (`70000001`…)?
2. **Číselná řada faktur:** e-shop ve **stejné řadě** iDokladu jako
   B2B faktury, nebo **vlastní řada** (např. `E2026…`, nastavuje se
   v iDokladu)?
3. **DPH:** Begina je **neplátce** DPH (`FINANCE_VAT_MODE = non_payer`)?
   Faktura se podle toho liší.
4. **Kontakty v iDokladu:** založit kontakt pro každého zákazníka
   (párování podle e-mailu, u firmy podle IČO), nebo jeden společný
   kontakt „E-shop – koncový zákazník“ s adresou na faktuře?
5. **Odeslání faktury:** posílat PDF v našem e-mailu „Platbu jsme
   přijali“ (doporučuji, jeden e-mail), nebo e-mailem z iDokladu?
6. **WooCommerce plugin:** dokud běží starý e-shop, fakturuje přes
   iDoklad plugin. Nový e-shop bude fakturovat **jen objednávky
   `channel = 'eshop'`** — dvojí faktura nevznikne, ale potřebuji vědět,
   zda plugin po přepnutí vypneme.

## 6. Pořadí implementace (po schválení)

1. Migrace `payment_vs` + `payments` + rozšíření `invoices` (skripty
   před / migrace / po / rollback, Preview spouští vedení ručně).
2. Pokladna a QR na `payment_vs`; Stripe webhook a ruční „Zaplaceno“
   zapisují `payments`; vznik `invoices(pending)`.
3. Modul vystavení faktury v režimu dry-run + obrazovka v detailu
   objednávky („Faktura: čeká / vystavena č. … / chyba“).
4. Testy nad falešným iDokladem (dvojí platba, výpadek po POST,
   opakování, nesoulad částky).
5. Teprve pak samostatné schválení ostrého vystavování v Production.

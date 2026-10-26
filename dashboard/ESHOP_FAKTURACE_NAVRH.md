# ESHOP 1.0 — fakturace přes iDoklad: finální schéma k odsouhlasení

Stav: **SCHVÁLENO (5. 10. 2026), v3 s úpravami; migrační balíček pro Preview připraven, NESPUŠTĚN.** Žádná migrace, žádný
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
| Faktura / dobropis | číslo dokladu | poskytovatel (dnes **iDoklad**, e-shopová řada) | po úhradě celé částky / při opravě |

## 2. Schéma (schváleno 5. 10. 2026, v3 s úpravami)

**Přesné SQL je v migračním balíčku `docs/eshop-payments/`** (jediný zdroj
pravdy, testovaný `lib/eshop/__tests__/paymentsMigration.test.ts`):

| Soubor | Co dělá |
|---|---|
| `10_before.sql` | kontrola před (jen čtení) |
| `11_migration.sql` | **krok A** — jen přidává (jedna transakce) |
| `12_after.sql` | kontrola po (jen čtení) |
| `19_rollback.sql` | vrácení kroku A; zastaví se, pokud už vznikla data |

**Preview: krok A spuštěn vedením 5. 10. 2026 (23:54)**, kontrola po
ověřena read-only: `5 | 1 | 1 | 1 | 0 | 2 | 2 | 9 | 0 | 0 | 9`.
Production: nespuštěno.

**Krok B (6. 10. 2026) — kód nasazen na Preview; migrace spuštěna vedením na Preview 6. 10. 2026,
kontrola po ověřena read-only: `1 | 7 | 0 | ano | ano` (900008 → 70000001 z nového kódu,
900002–900007 → 70000002–70000007). Production: nespuštěno.**

| Soubor | Co dělá |
|---|---|
| `20_before.sql` | kontrola před: krok A je hotový, nejnovější e-shopová objednávka už má VS (= nový kód běží) |
| `21_migration.sql` | doplní VS starším e-shopovým objednávkám (v pořadí vzniku) + `orders_eshop_requires_vs` |
| `22_after.sql` | kontrola po: povinný VS platí, žádná e-shopová objednávka bez VS, VS unikátní a ve formátu |
| `29_rollback.sql` | vypne jen povinnost; přidělené VS zůstávají (jsou neměnné) — vždy bezpečné |

Kód kroku B: pokladna přiděluje VS z řady v témže INSERTu
(`PAYMENT_VS_SQL`, `lib/eshop/orderWrite.ts`); QR, stránka objednávky
a e-maily čtou uložený `payment_vs` (číslo objednávky se jako VS už
nepoužívá); Stripe zapisuje každý pokus (Checkout Session) do `payments`
a úspěšná platba v téže transakci přepočítá Zaplaceno
(`lib/eshop/payments.ts`); v MojeBegina u e-shopové objednávky místo
přepínání stavu „Platby“ + „Zapsat platbu“ (převod / hotovost, částka,
datum, poznámka). Ruční B2B objednávky přepínají stav jako dosud.
`schema.ts` + `drizzle/0020_eshop_1_0_payments_invoicing.sql` (= krok A + B,
generuje `scripts/eshop-payments/build-drizzle.mjs`). Fakturace v iDokladu
zatím neběží.

**Krok A je zpětně kompatibilní** — dnešní kód nové sloupce nezná
a funguje dál, migraci lze spustit před nasazením nového kódu.
**Krok B** (připraví se spolu s kódem pokladny): doplnění VS starým
e-shopovým objednávkám na Preview + `orders_eshop_requires_vs`
(e-shopová objednávka bez VS nevznikne). Dřív by dnešní pokladna, která
VS ještě nepřiděluje, objednávku neuložila.

### 2.1 `orders.payment_vs`
- `text`, `UNIQUE`, formát `^7[0-9]{7}$`, řada `payment_vs_seq`
  (1…9 999 999, bez přetočení). Pokladna: `'7' || lpad(nextval('payment_vs_seq')::text, 7, '0')`.
- **Neměnnost hlídá databáze** (trigger `orders_payment_vs_immutable`):
  nastavený VS nejde přepsat ani smazat.

### 2.2 `payments` — libovolný počet záznamů k objednávce

**Stav transakce a směr peněz jsou dvě samostatné veličiny; částka je
vždy kladná** (`amount_hal > 0`, haléře).

| Sloupec | Hodnoty |
|---|---|
| `direction` | `inflow` (příjem) · `outflow` (vratka zákazníkovi) |
| `status` | `pending` (pokus / čeká) · `succeeded` (peníze se pohnuly) · `failed` · `cancelled` · `superseded` (ruční potvrzení nahrazené importem banky) · `refunded` (příjem, který byl celý vrácen) |
| `match_status` | `matched` · `unmatched` · `needs_review` |
| `source` + `external_id` | `UNIQUE` — idempotence (viz níže) |
| `refund_of_payment_id` | vratka → původní příjem (jen `outflow`) |
| `superseded_by_payment_id` | povinné právě u `superseded` |

Pravidla v DB: vratka je vždy `outflow`; `refunded` jen u `inflow`;
`superseded` ⇔ odkaz na nahrazující záznam; proběhlé peníze
(`succeeded` / `superseded` / `refunded`) mají `occurred_at`; ruční
záznam má `recorded_by_user_id`; spárovaný má objednávku; jen CZK.

| Situace | source | external_id |
|---|---|---|
| Pokus o platbu kartou | `stripe` | Checkout Session `cs_…` (`pending` → `succeeded` / `failed` / `cancelled`) |
| Vratka kartou | `stripe` | refund `re_…` (`outflow`) |
| Ruční potvrzení / ruční vratka | `manual` | jednorázový token formuláře |
| Import banky | `bank` | `<účet>:<ID pohybu>` |

**Stav úhrady** — pohled `order_payment_balance` (`required_hal`,
`received_hal`, `refunded_hal`, `net_hal`, `balance_state`): příjem se
počítá u `inflow` se stavem `succeeded` nebo `refunded` (peníze přišly),
vratka u `outflow` se stavem `succeeded`; pokusy, neúspěšné, zrušené
a nahrazené záznamy nikdy. `balance_state`: `unpaid` · `partially_paid` ·
`paid` · `overpaid` · `refunded`. **Zaplaceno = `paid` / `overpaid`.**
`orders.payment_status` zůstává souhrnem pro obrazovky (`unpaid` /
`invoiced` / `paid`, kód v `main` je zná); u e-shopu ho nastavuje jen
přepočet z pohledu ve stejné transakci jako zápis platby.

### 2.3 `invoices` — obchodní doklad (faktura i dobropis)

Rozšíření stávající tabulky; importované faktury The Cup dostanou
`origin = 'import'`, `doc_state = 'issued'`, `document_type = 'invoice'`
a jinak se nemění.

| Sloupec | Význam |
|---|---|
| `document_type` | `invoice` · `credit_note` |
| `corrects_invoice_id` | dobropis → opravovaná faktura (povinné právě u dobropisu) |
| `origin` | `eshop` · `import` · `manual` (u nových řádků povinné) |
| `doc_state` | `draft` (požádáno, čeká na číslo) · `issued` · `void` (nikdy nevystavený pokus) |
| `invoice_number`, `issued_at` | číslo a datum k zobrazení — u `issued` povinné; u dokladů od poskytovatele kopie z vazby níže |
| `payment_vs`, `customer_id`, `pdf_sent_at`, `updated_at` | VS, zákazník, kdy MojeBegina poslala PDF |

- **Jedna ostrá prodejní faktura na objednávku**: částečný unikátní index
  `(order_id) WHERE document_type = 'invoice' AND doc_state <> 'void'`
  (nahrazuje dnešní `invoices_order_id_unique`). Dobropisů může být víc.
- Vystavený doklad se nemaže ani nepřepisuje — opravuje se dobropisem.
- `organization_id`, `invoice_number`, `issued_at`, `status` přestávají
  být povinné (soukromý zákazník; číslo až od poskytovatele; `status` je
  historický stav z importu). `external_edoklad_id` zůstává beze změny
  (historický sloupec), nový kód používá vazbu níže.

### 2.4 `invoice_provider_links` — obecná vazba na externího poskytovatele

Dnes iDoklad; jiný poskytovatel = jen jiná hodnota `provider` (formát
`^[a-z][a-z0-9_]*$`, ne pevný seznam).

| Sloupec | Význam |
|---|---|
| `invoice_id`, `provider` | doklad a poskytovatel |
| `state` | `pending` · `dry_run` · `issued` · `failed` · `void` |
| `external_id`, `external_number`, `issued_at` | ID a číslo dokladu u poskytovatele, datum vystavení — u `issued` povinné |
| `number_series`, `external_url` | řada (e-shopová), odkaz na doklad |
| `pdf_storage_key`, `pdf_sha256`, `pdf_fetched_at` | uložené PDF |
| `attempts`, `last_error`, `last_error_at`, `next_attempt_at` | chybový stav a opakování (`failed` musí mít popis chyby) |
| `request_payload`, `response_ref` | co jsme poslali / poslali bychom, reference z odpovědi (bez tajných údajů) |

Unikátní: `(provider, external_id)`, `(provider, external_number)`;
**nejvýš jedna aktivní vazba na doklad** (`state <> 'void'`), historie
pokusů zůstává.

### 2.5 `invoice_customers` + `invoice_customer_refs`

- `invoice_customers`: `kind` (`person` / `company`), `email_normalized`,
  `ico`, `name`, `organization_id`. Unikátní: osoba podle e-mailu; firma
  podle IČO, firma bez IČO podle e-mailu.
- `invoice_customer_refs`: kontakt zákazníka u poskytovatele
  (`provider`, `external_id`) — `UNIQUE (provider, external_id)`
  a jeden kontakt na zákazníka a poskytovatele.
- Před založením kontaktu MojeBegina kontakt u poskytovatele vyhledá
  (IČO / e-mail), existující B2B firmy se nezakládají znovu. Údaje na
  faktuře jsou ze snapshotu objednávky.
- ⚠ `getCustomerOrders` (`lib/data/dashboard.ts`) spojuje objednávky
  s `invoices` bez filtru — s dobropisy musí brát jen
  `document_type = 'invoice'`. Upraví se spolu s kódem kroku B.

## 2.6 Fakturace — režim návrhu (6. 10. 2026, hotovo na větvi)

Bez migrace (používá tabulky z kroku A). **Do iDokladu se nic neodesílá**
— kód nemá žádného síťového klienta pro zápis a `invoicingMode()` vrací
vždy `dry_run` (i v Production s `IDOKLAD_INVOICING_ENABLED=on`).

| Soubor | Co dělá |
|---|---|
| `lib/eshop/invoicing/draft.ts` | čistě: objednávka + položky + platby → návrh faktury (odběratel, řádky vč. dopravy a slevy, VS, data = den úplné úhrady, způsob úhrady, platby, které fakturu kryjí) a problémy (`error` = data nesedí, `warning` = ke kontrole, `live` = doplnit před ostrým vystavením) |
| `lib/eshop/invoicing/idoklad.ts` | čistě: návrh → požadavky iDokladu API v3 (kontakt, pojistka podle VS, vydaná faktura); číselná ID číselníků zatím `null` (ověřit v SDK) |
| `lib/eshop/invoicing/mode.ts` | režim (vždy návrh) a `IDOKLAD_ESHOP_SEQUENCE_ID` (ID e-shopové řady — potvrzeno **7277293**, viz 2.7) |
| `lib/eshop/invoicing/service.ts` | uložení: zákazník (osoba podle e-mailu) + `invoices` (draft) + `invoice_provider_links` (`dry_run`, `request_payload` = vše výše) v jednom příkazu; přegenerování jen dokud není vystaveno |

- Vzniká automaticky po úplném zaplacení (Stripe webhook, „Zapsat
  platbu“), nebo tlačítkem „Vytvořit návrh faktury“ v MojeBegina. Chyba
  návrhu nikdy nezruší platbu — zapíše se do historie objednávky.
- **Pojistka proti dvojí faktuře:** jedna prodejní faktura na objednávku
  a jedna aktivní vazba na poskytovatele (unikátní indexy) — opakované
  i souběžné volání nic nezdvojí; v ostrém režimu navíc vyhledání faktury
  s VS v iDokladu před vystavením.
- **MojeBegina, detail e-shopové objednávky → blok „Faktura (iDoklad)“:**
  režim návrhu, chyby / upozornění / co doplnit před ostrým provozem,
  odběratel, VS, data, položky, platby, kroky ostrého vystavení a přesná
  data pro iDoklad (JSON); „Přegenerovat návrh z aktuálních údajů“.

**Zapnutí ostrého vystavování (později, samostatné schválení) — beze
změny architektury:** doplnit `IDOKLAD_ESHOP_SEQUENCE_ID`, ověřit pole
a číselníky v SDK, přidat live provider (kontakt → kontrola VS → POST
faktury → uhrazeno → PDF) s vlastní pojistkou zápisu podle vzoru
finance `requestGuard`, refresh token (`offline_access`) a změnit jen
`invoicingMode()`. Stav vazby pak přejde `pending → issued / failed`
(sloupce na to už jsou).

## 2.7 E-shopová číselná řada v iDokladu — napojení (6. 10. 2026)

Kód je připravený (`lib/eshop/invoicing/numberSeries.ts`): MojeBegina
zná jen **ID řady** (`IDOKLAD_ESHOP_SEQUENCE_ID`), čísla faktur přiděluje
iDoklad. Návrh faktury ukazuje stav: chybí ID → „doplnit“; neplatné ID →
problém; platné ID → „ověřit v iDokladu“. Ověření (`checkEshopSeries`)
proti seznamu řad z iDokladu hlídá, že řada existuje, je pro **vydané
faktury** a **není výchozí** (výchozí řada patří ruční B2B fakturaci
a WooCommerce pluginu — e-shop by se s ní promíchal).

**Postup:**
1. V iDokladu (agenda Begina) založit novou číselnou řadu **pro vydané
   faktury**, odlišitelnou od B2B (např. s předponou „E“), a **nenastavovat
   ji jako výchozí**. Ověřit, že tarif víc řad dovoluje.
2. Zjistit její **ID** — aplikace iDokladu ho neukazuje; čte se jen přes
   API: `GET /v3/NumericSequences?filter=DocumentType~eq~0` (jen čtení).
   Nejjednodušeji rozšířit read-only test iDokladu na `feature/finance-1-0`
   o výpis řad (ID, název, formát, výchozí ano/ne) — **jiná větev, jen se
   souhlasem vedení**.
3. Ve Vercelu nastavit pro Preview této větve `IDOKLAD_ESHOP_SEQUENCE_ID`
   = ID řady (není tajné) a nechat Preview znovu nasadit; v MojeBegina
   u zaplacené objednávky „Přegenerovat návrh“ → místo „Chybí ID…“ se
   ukáže „Řadu ID … ověřit v iDokladu“.
4. Před ostrým vystavováním ověří řadu automaticky live provider
   (`checkEshopSeries` nad čtecím dotazem z bodu 2) a nevystaví nic, pokud
   řada nesedí.

**Stav (7. 10. 2026) — kroky 1–3 hotové:**

| ID | Název | Formát | Typ dokladu | Výchozí | Poslední číslo / rok |
|---|---|---|---|---|---|
| **7277293** | E-shop Begina | `9{RR}{NNNN}` | Vydané faktury (DocumentType 0) | **ne** | 0 / 2026 |

- Řadu založilo vedení ručně v iDokladu; ID přečetl read-only test
  iDokladu na `feature/finance-1-0` (nic se nezapsalo). Výchozí řada
  vydaných faktur (B2B) je 2032369 `{RRRR}{NNNN}` — e-shop ji nepoužívá.
- Čísla faktur: 9260001, 9260002, … (9 + rok 26 + 4 místa = max. 9 999
  faktur za rok). **VS na faktuře zůstává `payment_vs` objednávky
  (7xxxxxxx)**, ne číslo faktury — zákazník platil dřív, než faktura
  vznikla, a podle VS funguje pojistka proti dvojí faktuře.
- Preview `claude/great-bell-ffjwo3`: `IDOKLAD_ESHOP_SEQUENCE_ID=7277293`
  (jen Preview této větve). Objednávka 900008 po „Přegenerovat návrh“:
  `invoice_provider_links.number_series` = návrh = `NumericSequenceId`
  = 7277293, VS 70000001, stav `dry_run`, 1 faktura / 1 vazba (ověřeno
  read-only v Neon Preview).
- Na Production se proměnná nastaví až při ostrém přepnutí (stejné ID —
  řada patří agendě Begina, ne prostředí).

## 2.8 Ostré vystavení do iDokladu — kód hotový, na Preview zablokovaný (7. 10. 2026)

Kód je kompletní (`lib/eshop/invoicing/issue.ts`, `idokladHttp.ts`,
`afterPaid.ts`); **zapíná se jen bránou** `liveInvoicingGate` (mode.ts),
která je otevřená, jen když platí vše zároveň:

| Podmínka | Hodnota |
|---|---|
| `VERCEL_ENV` (systémová, na Preview ji nelze nastavit) | `production` |
| `IDOKLAD_INVOICING_ENABLED` | `on` |
| `IDOKLAD_ESHOP_SEQUENCE_ID` | přesně `7277293` (jinak zavřeno) |
| `IDOKLAD_ESHOP_CLIENT_ID` + `IDOKLAD_ESHOP_CLIENT_SECRET` + `IDOKLAD_ESHOP_APPLICATION_ID` | Client Credentials agendy Begina: ID a Secret = API klíče uživatele z iDokladu (Nastavení → Aplikace), ApplicationId = aplikace „MojeBegina Eshop“ (flow ClientCredentials) z Developer portálu. Token request přesně podle SDK 5.4.0: `grant_type=client_credentials`, `application_id`, `client_id`, `client_secret`, `scope=idoklad_api` na `identity.idoklad.cz/server/v2/connect/token`. Bez `application_id` iDoklad odmítne (400) — zjištěno 8. 10. 2026. |

Druhá pojistka v HTTP klientovi: zápis (jen `POST /Contacts`,
`POST /IssuedInvoices`, `PUT /IssuedDocumentPayments/FullyPay/{id}`) projde
jen klientem z otevřené brány a brána se ověří znovu před KAŽDÝM zápisem.
Vše ostatní (DELETE, PATCH, `/Mails`, číselné řady, dobropisy, webhooky,
jiný host) se zablokuje před odesláním. Test: klient s `writesAllowed: true`
na Preview nezavolá `fetch` ani jednou.

**Postup vystavení (pořadí):** zaplaceno? (`payment_status = paid` A
`order_payment_balance = paid/overpaid`, VS 7xxxxxxx) → zámek vazby (10 min,
souběh = jediná faktura) → aktuální návrh bez blokujících chyb → agenda
(IČO 74337297, neplátce) → řada 7277293 (vydané faktury, ne výchozí, název
„E-shop Begina“) → známé ID z iDokladu, jinak hledání faktury podle VS
(1 = připojit, >1 = stop, jiná řada = stop) → kontakt (vazba
`invoice_customer_refs` → hledání podle e-mailu → založení, země CZ) →
CZK, způsob úhrady (převodem/kartou/hotově podle názvu, jednoznačně) →
výchozí faktura agendy (účet, konst. symbol, typ ceny a sazba položek) →
další číslo v řadě (`NumericSequences/DocumentNumbers`, formát 9{RR}{NNNN})
→ `POST /IssuedInvoices` → **ID hned do DB** → kontrola částky a nulové
DPH → `FullyPay` → kontrola „Paid“ → PDF (`Reports/IssuedInvoice/{id}/Pdf`,
`%PDF-`, SHA-256) → **teprve teď** `invoices.doc_state = issued` +
`invoice_provider_links.state = issued` jedním příkazem → e-mail MojeBegina
s PDF, `pdf_sent_at`.

**Chyba kdekoli:** faktura zůstane `draft`, vazba `failed` + `last_error`
(+ ID z iDokladu, pokud faktura už vznikla). MojeBegina ukáže „objednávka
NENÍ vyfakturovaná“ a tlačítko „Vystavit fakturu znovu“ (jen v ostrém
režimu) — další pokus fakturu podle ID/VS jen dokončí, novou nevytvoří.
Zákazník dostane potvrzení platby bez faktury a po dokončení zvlášť
„Faktura k objednávce“ s PDF. iDoklad sám nic neposílá.

**Testy:** `lib/eshop/__tests__/idokladLive.test.ts` (19, napodobenina
iDoklad API v3 + PGlite): Preview nic, celý tok, idempotence, souběh,
ztracená odpověď po vytvoření, chyba „uhrazeno“, nesedící částka, výchozí /
chybějící / přejmenovaná řada, cizí agenda, plátce DPH, víc faktur s VS,
faktura s VS v jiné řadě, nezaplaceno, kontakt podle e-mailu a vazby.

**Ověřit read-only před zapnutím (bod 3, test na `feature/finance-1-0`):**
názvy způsobů úhrady (převod / karta / hotově — musí sedět jednoznačně),
CZK, CZ, výchozí faktura agendy (typ ceny a sazba položek u neplátce).

## 2.9 Ruční režim (B1) a kontrola iDokladu před vystavením (B2) — 7. 10. 2026

**Přepínač `IDOKLAD_INVOICING_ENABLED` — tři stavy** (`lib/eshop/invoicing/mode.ts`):

| Hodnota | Co se stane po zaplacení | Tlačítko „Vystavit fakturu v iDokladu“ |
|---|---|---|
| chybí / `off` (i neplatná hodnota, např. `ON`, `yes`) | jen návrh, do iDokladu nic | ne |
| `manual` | jen návrh — **nic automaticky** | ano, jen oprávněný uživatel, jen zaplacená a nevystavená objednávka |
| `on` | automatické vystavení | ano (opakování po chybě) |

`manual` i `on` volají **tentýž motor** `issueInvoice` (issue.ts) se stejnou
kontrolou, zámkem a idempotencí. **Preview je vždy jen návrh** — i s `manual`
/ `on` a Production přístupovými údaji (brána vyžaduje `VERCEL_ENV=production`,
akce i motor to ověřují samy a HTTP klient znovu před každým zápisem).

**Oprávnění** (`lib/data/invoiceAuth.ts`): vystavit fakturu a spustit kontrolu
iDokladu smí jen Jaroslav Viner s aktivní rolí ADMIN a Lucie Königsbergová
(finanční ředitelka, od 8. 10. 2026) s aktivní rolí EXECUTIVE — konkrétní
osoba + její role, ne role sama (stejně jako Finance 1.0).

**Kontrola iDokladu — preflight** (`lib/eshop/invoicing/preflight.ts`), jen
GET + token: přihlášení Client Credentials, agenda IČO 74337297, neplátce DPH,
CZK, CZ, Bank transfer / Credit card / Cash (dobírka vyloučená, každý právě
jeden), řada 7277293 „E-shop Begina“ (vydané, ne výchozí), další číslo
(9{RR}{NNNN}, jen náhled), typ ceny položek. **Kterákoli kontrola neprojde =
faktura se nevystaví** (stav „failed“ s důvodem, žádný zápis). Proběhne
automaticky před KAŽDÝM pokusem o vystavení a jde spustit ručně:
**MojeBegina → Objednávky → detail e-shopové objednávky → „kontrola
připojení“** (`/rizeni-firmy/objednavky/idoklad`) — stejné Production údaje
(`IDOKLAD_ESHOP_CLIENT_ID/SECRET`), klient bez práva zápisu, funguje i s
vypnutou fakturací.

**Pozor na e-maily v Production:** „Platbu jsme přijali“ i „Faktura
k objednávce“ (PDF) odejdou jen s `ESHOP_EMAIL_LIVE=on` **a zároveň**
`ESHOP_ORDER_WRITE=on` (`lib/eshop/email/config.ts`). Během prvního testu
faktury proto `ESHOP_ORDER_WRITE` nevypínat; objednávky zastaví
`ESHOP_PUBLIC` (bez něj je `/eshop` 404).

**Opraveno při B1/B2 (testy to odhalily):** HTTP klient bral výslovné
`fetchImpl: undefined` jako hodnotu → ostré vystavení by v Production vždy
spadlo; konflikt vazby zákazník ↔ kontakt iDokladu (stejný kontakt u dvou
zákazníků) zastavoval vystavení — vazba je teď jen zkratka a neblokuje.

**Stav B1 (uzavřeno vedením 7. 10. 2026):** ověřeno automatickými testy
a Preview DB po nasazení `5866e30` (objednávka 900008 zůstala `dry_run`, bez
external_id, bez čísla faktury, bez pokusu; na větvi žádná stopa zápisu do
iDokladu). Interaktivní test ve Vercelu neproveden — prostředí Claude nemá
přístup k Vercelu; vedení ho nepožaduje.

**Testy:** `idokladManual.test.ts` (off, manual, on, Preview+manual,
Preview+on, dvojklik, oprávnění, selhání Client Credentials, každá kritická
kontrola, sdílený kontakt), `idokladLive.test.ts`, UI `OrderInvoiceDraft.test.tsx`.

## 3. Workflow

```
Objednávka (checkout)
  └─ INSERT orders: order_number + payment_vs (7xxxxxxx)
     └─ QR / e-mail / stránka: VS = payment_vs, datum v QR = den objednávky

Platba (libovolně mnoho záznamů)
  ├─ karta: přesměrování → payments(stripe, cs_…, pending)
  │         webhook → stejný řádek succeeded / failed / cancelled
  ├─ převod (V1): MojeBegina „Zapsat platbu“ → payments(manual, token formuláře, inflow, succeeded)
  ├─ převod (později): import banky → payments(bank, účet:ID pohybu) → párování VS + částka
  └─ vratka: payments(…, outflow, refund_of_payment_id); původní příjem → refunded (celá vratka)
  → VE STEJNÉ TRANSAKCI: přepočet order_payment_balance
       paid/overpaid  → orders.payment_status = paid, paid_at,
                        order_activity „Zaplaceno“,
                        invoices(invoice, draft) + invoice_provider_links(idoklad, pending)
                        — jen pokud prodejní faktura ještě neexistuje
       partially_paid → aktivita „Částečná úhrada X Kč, zbývá Y Kč“

Vystavení faktury (samostatný krok, opakovatelný; cron + tlačítko „Vystavit znovu“)
  1. invoice_customers: najít podle IČO / e-mailu, jinak vyhledat v iDokladu,
     jinak založit kontakt v iDokladu
  2. POJISTKA: vyhledat u poskytovatele doklad s VS = payment_vs → už existuje? jen uložit číslo a ID
  3. POST IssuedInvoices: e-shopová řada, neplátce DPH, VS = payment_vs,
     datum vystavení = den úhrady, položky = snapshot order_items + doprava,
     štítek „E-shop“, BEZ odeslání e-mailu z iDokladu
  4. označit jako uhrazenou (FullyPay — přesnou cestu ověřit v oficiálním SDK)
  5. uložit číslo a ID do vazby (issued) a do faktury (invoice_number, issued_at, doc_state = issued)
  6. stáhnout PDF z iDokladu → e-mail „Platbu jsme přijali“ s PDF → pdf_sent_at

Chyba v 1–6 → vazba state = failed, last_error, next_attempt_at; další pokus později.
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
  návrh faktury (vazba `state = dry_run`, `request_payload`), nic
  neodešle. **Na Preview vždy dry-run** (jediná agenda je ostrá agenda
  Beginy). Production až po samostatném schválení.
- Pojistka agendy: zapisovat jen do agendy s IČO 74337297 a režimem DPH
  „neplátce“; jinak nic.
- Token pro běh bez člověka (refresh token, `offline_access`, šifrovaně
  v DB) — společné rozhodnutí s Finance, řeší se jednou pro obojí.

## 5. Pořadí implementace

1. **Krok A — migrace** (`docs/eshop-payments/`, připraveno): Preview
   spouští vedení ručně po souhlasu; Production až po samostatném schválení.
2. **Krok B — kód + povinný VS**: pokladna a QR na `payment_vs`; Stripe
   zapisuje pokusy a výsledky do `payments`; ruční „Zapsat platbu“
   v MojeBegina; přepočet stavu; `schema.ts` + drizzle migrace; doplnění VS
   starým e-shopovým objednávkám na Preview a `orders_eshop_requires_vs`.
3. Modul vystavení faktury v režimu dry-run + v detailu objednávky
   „Platby“ a „Faktura: čeká / vystavena č. … / chyba“.
4. Testy nad falešným iDokladem: dvojí webhook, částečná úhrada
   + doplatek, přeplatek, vratka, ruční potvrzení + import banky, výpadek
   po POST, opakování, deduplikace kontaktů.
5. Samostatné schválení ostrého vystavování; po ověření a finálním
   přepnutí e-shopu vypnout WooCommerce plugin pro iDoklad.

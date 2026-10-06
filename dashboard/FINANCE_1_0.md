# FINANCE 1.0 — iDoklad a finanční přehled v MojeBegina

Stav (4. 10. 2026): návrh schválen vedením jako základ, s opravami
a rozhodnutími z 4. 10. 2026. Na větvi `feature/finance-1-0` je hotová
vrstva **bez migrace a bez zápisu do DB**: čtecí klient iDoklad API v3,
normalizace, výpočty ukazatelů, synchronizace nad rozhraním úložiště,
oprávnění, fixture data a testy. Schéma, migrace, UI napojené na DB a cron
přijdou až po sloučení Google Kalendáře do main.

## 1. Opravy a zjištění

- **API v2 končí 5. 10. 2026** (oficiální článek iDokladu). Dřívější údaj
  8. 9. 2026 byl chybný. Finance používá výhradně **API v3**.
- **WooCommerce → iDoklad:** z vývojového prostředí nelze ověřit —
  `begina.cz` i všechny domény iDokladu jsou blokované síťovou politikou
  a repozitář o napojení nic neobsahuje. Ruční kontrola (bez změny webu)
  je v oddílu 12. **Pokud plugin jede přes API v2, od 5. 10. 2026 přestane
  vystavovat faktury.**
- **Ověřeno v oficiálním SDK** (`Solitea/IdokladSdk`, 7. 9. 2026):
  - řazení seznamů jen podle `Id`, `DateOfIssue`, `DocumentNumber` —
    **ne podle data změny**;
  - filtr data změny se u přijatých faktur jmenuje `DateLastChanged`,
    u ostatních `DateLastChange`;
  - prodejky a úhrady filtr data změny nemají;
  - vazba prodejka → faktura v API v3 **neexistuje**;
  - záloha nese `AccountedByInvoiceId`, konečná faktura má položky
    `ItemTypeReduce` s `InvoiceProformaId`;
  - `GET /Account/CurrentAgenda` vrací IČO agendy a `VatRegistrationType`
    (ověření DPH a agendy před importem).

## 2. Rozsah Finance 1.0

**Ano:** bezpečné čtecí připojení k API v3; celá historie vydaných faktur,
dobropisů, prodejek, přijatých faktur, přijatých účtenek a úhrad (+ zálohové
faktury jen kvůli vysvětlení úhrad); idempotentní ukládání; fakturovaná
a uhrazená tržba; náklady; pohledávky, závazky, doklady po splatnosti; stav
a čas poslední synchronizace; „Synchronizovat nyní“; cockpit pro Vinera
a Lucii.

**Ne (až po ověření základních čísel):** webhooky, bankovní API, Stripe,
Storyous, Odoo, AI konektor, editor segmentačních pravidel, detailní
historie změn dokladů.

## 3. Pořadí migrací

- Finance **nerezervuje žádné číslo migrace**.
- `feature/google-calendar-1-0` už nese `0013_phase_20_google_calendar`.
- Postup: po sloučení Google Kalendáře do main se `feature/finance-1-0`
  sloučí/rebasuje na aktuální main a migrace se vygeneruje na **skutečném
  dalším volném čísle**. E-shopové migrace se přečíslují podle stavu main
  samostatně (na e-shopovou větev Finance nesahá).
- Production nemá `__drizzle_migrations` → migrace se pouští ručně SQL
  skripty (kontrola před / migrace / kontrola po / rollback), stejně jako
  u e-shopu.

## 4. Bezpečnost HTTP klienta (`lib/finance/idoklad/`)

- **POST jen na přesnou adresu** `https://identity.idoklad.cz/server/v2/connect/token`
  (Client Credentials, scope `idoklad_api`).
- **Na datové API (`api.idoklad.cz/v3`) jen GET** a jen na povolené
  kolekce (`endpoints.ts`). POST/PUT/PATCH/DELETE na API, jiný host, http,
  jiný port, přihlašovací údaje v URL, `..` nebo zakódované lomítko v cestě
  → zablokováno **před odesláním** (`requestGuard.ts`).
- Přesměrování se nesledují (`redirect: "error"`), bez cache.
- Client ID, Client Secret ani access token se nelogují ani neukládají
  do DB; token žije jen v paměti klienta. Chybové zprávy procházejí
  `redactSecrets` (známá tajemství i tvary `client_secret=`, `Bearer …`).
- Limit požadavků na jeden běh (výchozí 500) chrání denní kvótu API
  (neoficiálně ~7 500/den — neověřeno).
- **Webhooky se neimplementují**, dokud z oficiální dokumentace nebude
  ověřený podpis, formát zprávy, opakování doručení a ochrana proti
  zneužití limitu API. Tajný token v URL sám o sobě nestačí.

## 5. Prostředí (`lib/finance/config.ts`)

| Prostředí | Přístupové údaje | Výsledek |
|---|---|---|
| Production | žádné | vypnuto |
| Production | údaje, bez `IDOKLAD_LIVE_ENABLED=on` | vypnuto (čeká na samostatné schválení) |
| Production | údaje + `IDOKLAD_LIVE_ENABLED=on` + `FINANCE_COMPANY_ICO` | živá agenda — **jen když IČO agendy = IČO Beginy** |
| Preview / vývoj | žádné | **fixture data** |
| Preview / vývoj | údaje bez `IDOKLAD_AGENDA_KIND=test` | vypnuto |
| Preview / vývoj | `IDOKLAD_AGENDA_KIND=test` + `FINANCE_COMPANY_ICO` | testovací agenda — **odmítne se, pokud má IČO Beginy** |

`IDOKLAD_LIVE_ENABLED` mimo Production nic nepovolí. **DPH** je nastavení
`FINANCE_VAT_MODE` (`non_payer` | `payer`), před importem se porovná
s `VatRegistrationType` agendy; nesoulad nebo „identifikovaná osoba“
import zastaví.

## 6. Ukazatele (`lib/finance/metrics.ts`)

| Ukazatel | Definice | Datum |
|---|---|---|
| Fakturovaná tržba | vydané faktury + prodejky − dobropisy; konečná faktura v plné hodnotě prodeje (odečet zálohy se přičte zpět); záloha nikdy | vystavení (DUZP uložené jako alternativa) |
| Uhrazená tržba | úhrady faktur a záloh + úhrady prodejek − vratky k dobropisům | platba |
| Náklady | přijaté faktury + přijaté účtenky (neplátce: s DPH, plátce: bez DPH) | vystavení (přijetí) |
| Pohledávky | celkem − úhrady k datu − nevrácená část dobropisů; po splatnosti = splatnost < dnes | k datu |
| Závazky | přijaté faktury − úhrady k datu | k datu |
| Cashflow | příjmy (uhrazená tržba) − výdaje (úhrady přijatých faktur + přijaté účtenky) | platba |
| Provozní výsledek z evidovaných dokladů | fakturovaná tržba − evidované náklady — **nikdy „zisk“** | vystavení |

Dobropis snižuje tržbu v období **svého** vystavení, vazba na původní
fakturu (`creditedExternalId`) zůstává; dobropis bez štítku převezme segment
faktury. „Dnes“ a měsíce se počítají v čase Europe/Prague. Částky interně
v haléřích (integer).

**Segmenty přes štítky iDokladu:** B2B Begina, E-shop, Bistro Jandl, Akce,
Výroba, Režie, Nezařazeno. Jeden segmentový štítek → segment; žádný nebo
dva různé → Nezařazeno (vždy viditelně uvedené, s počtem dokladů).

## 7. Pravidla proti dvojímu započtení (každé má test)

| | Pravidlo |
|---|---|
| D1 | **Prodejka zahrnutá do vydané faktury** (vazba `receipt_in_invoice`): tržbou je jen faktura. Peníze přijaté na prodejku zůstávají, úhrady faktury se o ně zkrátí (varování v cockpitu), pohledávka faktury je zohlední. API v3 tuto vazbu nenese → zapisuje ji člověk; prodejka a faktura stejnému partnerovi na stejnou částku do 31 dní bez vazby se v cockpitu **vždy ukážou jako „možná duplicita“**. |
| D2 | **Záloha a konečná faktura:** záloha není tržba; platba zálohy je příjem jednou; konečná faktura v plné hodnotě, bez falešné pohledávky. |
| D3 | **Spárovaná úhrada a bankovní/pokladní pohyb:** peníze se počítají z úhrady; spárovaný pohyb se přeskočí, nespárovaný (např. poplatek) se počítá. Úhrady prodejek se berou jen z prodejky (v seznamu úhrad se přeskočí). |
| D4 | **Plný a částečný dobropis:** záporná tržba v období dobropisu; sníží pohledávku jen o svou nevrácenou část; vratka je záporný příjem; dobropis k zaplacené faktuře bez vratky = „k vrácení zákazníkovi“. |
| D5 | **Smazaný a obnovený doklad:** smazaný doklad ani jeho úhrady se nepočítají; po obnovení zase ano. Mazat smí jen úplný průchod od první stránky. |
| D6 | **Objednávky** (`orders`) se do financí nepočítají nikdy; vazba doklad ↔ objednávka je jen informační. Tabulka `invoices` se nepoužívá. |

Ukládání (`lib/finance/store.ts`): klíč `(source, doc_type, external_id)` /
`(source, side, external_id)`; starší verze (podle data změny) nepřepíše
novější; stejný obsah (hash) = beze změny; mazání jen příznakem.

## 8. Datový model V1 (vznikne migrací po sloučení Google Kalendáře)

| Tabulka | Obsah |
|---|---|
| `fin_sources` | připojení: provider, agenda (id, název, IČO), ověřený režim DPH, stav. **Žádné tajné údaje.** |
| `fin_sync_state` | stav po typech dokladů = `SyncCursor` (hranice přírůstku, poslední úplný průchod, poslední úspěch, rozpracovaná stránka), zámek proti souběžným během |
| `fin_sync_runs` | každý běh: druh, kdo spustil, časy, stav (success/partial/error), počty, počet požadavků, očištěná chyba |
| `fin_documents` | doklady dle `FinDocument` (částky v haléřích `bigint`, data `date`, `raw jsonb`, `content_hash`), UNIQUE `(source, doc_type, external_id)` |
| `fin_payments` | úhrady dle `FinPayment`, UNIQUE `(source, side, external_id)` |
| `fin_document_links` | vazby `order` (doklad ↔ `orders.id`) a `receipt_in_invoice`, kdo a kdy |
| view `fin_v_*` | měsíční souhrn, pohledávky, závazky — musí vracet stejná čísla jako `metrics.ts` (test nad fixture daty) |

## 9. Synchronizace (`lib/finance/sync.ts`)

1. `GET /Account/CurrentAgenda` → kontrola IČO a DPH; při nesouladu se nic
   nestáhne.
2. Typy dokladů seřazené tak, aby rozpracovaný import měl přednost; každý
   typ stránka po stránce (`Id~Asc`, 100 na stránku), každá stránka se hned
   uloží.
3. **Počáteční import celé historie** = úplný průchod; při vyčerpání limitu
   se uloží další stránka a příští běh naváže (hranice přírůstku = začátek
   prvního běhu, změny mezi běhy se neztratí).
4. **Přírůstkově:** doklady podle data změny od začátku posledního
   dokončeného průchodu − 3 h; prodejky okno 60 dní; úhrady 90 dní.
5. **Úplný průchod** (pravidelně) navíc označí smazané doklady a úhrady.
6. „Synchronizovat nyní“ = přírůstkový běh (Viner). Pravidelná kontrola
   podle tarifu Vercelu: Hobby = cron 1× denně (přírůstek + jednou týdně
   úplný průchod), Pro = častěji. Ověřit tarif.
7. `inspectAgendaUsage` — jednorázová read-only kontrola, zda Begina
   v iDokladu používá banku, pokladnu a prodejky (5 požadavků).

## 10. Oprávnění (`lib/data/financeAuth.ts`)

Podle konkrétní osoby (userId) **a** role: Viner (ADMIN) — čtení,
nastavení, synchronizace; Lucie Königsbergová (EXECUTIVE) — jen čtení.
Nikdo další, ani jiný ADMIN/EXECUTIVE. Nepotvrzená aktivní role se
k autorizaci nepoužije.

## 11. Obrazovka `/rizeni-firmy/finance` (po migraci)

Data připravuje `buildFinanceCockpit` (`lib/finance/cockpit.ts`), stránka
jen zobrazuje: tržba dnes / tento / minulý měsíc; uhrazená tržba; náklady;
cashflow; provozní výsledek z evidovaných dokladů (s upozorněním, že nejde
o zisk); pohledávky a závazky s doklady po splatnosti; rozdělení podle
segmentů včetně Nezařazeno; varování (možné duplicity, úhrady bez dokladu,
nesoulad úhrad); panel „Co čísla obsahují a co ne“; stav a čas poslední
synchronizace; „Synchronizovat nyní“ (jen Viner). V Preview bez údajů
ukáže fixture data s jasným označením.

## 12. Manuální kroky

**WooCommerce (jen kontrola, nic neměnit):** WordPress → Pluginy → najít
plugin pro iDoklad (fakturace) → verze a nastavení (zda žádá Client ID /
Secret pro API v3, nebo staré přihlášení v2). V iDokladu → Nastavení →
API/Doplňky: seznam připojených aplikací. Pokud jede přes v2, řešit hned.

**iDoklad (až po schválení připojení):** ověřit, že tarif povoluje API;
založit uživatele „MojeBegina API“ s nejnižší rolí, která čte všechny
doklady; vygenerovat Client ID/Secret; připravit štítky segmentů (přesné
názvy výše); testovací agenda pro Preview, je-li dostupná.

**Vercel (až po migraci):** Production — `IDOKLAD_CLIENT_ID`,
`IDOKLAD_CLIENT_SECRET` (Sensitive), `FINANCE_COMPANY_ICO`,
`FINANCE_VAT_MODE`, a `IDOKLAD_LIVE_ENABLED=on` až po samostatném
schválení; Preview — jen údaje testovací agendy + `IDOKLAD_AGENDA_KIND=test`,
nebo nic (fixture). `CRON_SECRET` pro pravidelnou kontrolu.

## 13. K ověření na reálných datech (před ostrým importem)

- znaménko dobropisů a vratek v API v3 (normalizace je na obojí odolná);
- zda iDoklad zapisuje „úhradu dobropisem“ (zápočet) jako úhradu faktury —
  ovlivnilo by „k vrácení zákazníkovi“;
- formát dat v odpovědích (s časovou zónou / bez) — normalizace zvládne
  obojí;
- zda se úhrady prodejek objevují i v `IssuedDocumentPayments`;
- maximální `pageSize` a skutečný denní limit API;
- časová zóna filtru data změny (pokryto překryvem 3 h).

## 14. Ověřeno na větvi (bez sítě, bez DB)

`npx vitest run lib/finance lib/data/__tests__/financeAuth.test.ts` —
pojistka jen-čtení (POST jen token, jinak GET), tajné údaje v chybách
a lozích, mapování chyb, limit požadavků, stránkování; normalizace
(znaménka, data, haléře, cizí měna, záloha); idempotence a smazání/obnovení;
všechny ukazatele proti ručně spočítaným hodnotám; D1–D6; DPH plátce/
neplátce; DUZP; segmenty; pražský čas; synchronizace end-to-end nad
falešným iDokladem (počáteční import, navázání po limitu přes víc běhů,
429, smazání/obnovení, úprava dokladu, pojistky agendy a DPH, žádný jiný
požadavek než GET a POST na token); oprávnění.

## 15. OAuth připojení — první read-only test (jen Preview, 4. 10. 2026)

Developer aplikace iDokladu **MojeBegina**, flow **AuthorizationCode**,
Redirect URI pro Production a Preview. Test je na větvích
`claude/great-bell-ffjwo3` i `feature/finance-1-0` (proměnné prostředí
vedení nastavilo pro `feature/finance-1-0`); v Production jsou obě routy
vypnuté (404). Každá Preview větev potřebuje v iDokladu vlastní Redirect
URI a ve Vercelu vlastní `IDOKLAD_REDIRECT_URI`.

**Průchod:** `/rizeni-firmy/finance/idoklad` (jen Viner) → „Připojit iDoklad
(jen čtení)“ → `/api/idoklad/connect` (podepsaný `state` vázaný na userId,
httpOnly cookie 10 min) → přihlášení v iDokladu → `/api/idoklad/callback`
(ověření `state`, výměna kódu za token, read-only kontrola, token se
zahodí) → stránka s výsledkem.

**Co se přečte:** `GET /Account/CurrentAgenda` (název, IČO, DPH, tarif)
a u 14 kolekcí jen počet záznamů (pageSize=1). **Od 6. 10. 2026 navíc**
`GET /NumericSequences` (jen čtení, kolekce přidaná do povolených) —
výpis číselných řad (ID, název, formát, typ dokladu, výchozí) pro výběr
e-shopové řady vydaných faktur (`IDOKLAD_ESHOP_SEQUENCE_ID` na e-shopové
větvi). Výpis jde na stránku v samostatné podepsané cookie (limit ~4 kB),
max. 20 řad. **Od 7. 10. 2026 navíc** (bod 3 e-shopové fakturace, jen
čtení, `lib/finance/codebookCheck.ts`): `GET /PaymentOptions`,
`/Currencies?filter=Code~eq~CZK`, `/Countries?filter=Code~eq~CZE`,
`/IssuedInvoices/Default` (šablona — nic nezakládá) a
`/NumericSequences/DocumentNumbers/IssuedInvoice?numericSequenceId=7277293`
(náhled dalšího čísla — nic nerezervuje). Stránka ukáže ID CZK a CZE,
způsoby úhrady a jak je e-shop spáruje (převodem / kartou / hotově — musí
vyjít právě jeden), typ ceny a sazbu položky výchozí faktury u neplátce
a další číslo v řadě E-shop Begina. Vlastní podepsaná cookie. Nic se
nezapisuje do iDokladu ani do DB. Scope jen `idoklad_api` — bez `offline_access`, takže
nevznikne refresh token.

**Adresy (neoficiální, shodně Orchesty 29. 9. 2026 a dvě PHP knihovny):**
authorize `https://identity.idoklad.cz/server/connect/authorize`, token
`https://identity.idoklad.cz/server/connect/token`. Pojistka povoluje POST
jen na tyto dvě přesné tokenové adresy (+ v2 pro Client Credentials).

**Proměnné prostředí — Vercel, prostředí Preview, větev `feature/finance-1-0`:**

| Proměnná | Hodnota | Citlivá |
|---|---|---|
| `IDOKLAD_OAUTH_TEST_ENABLED` | `on` | ne |
| `IDOKLAD_CLIENT_ID` | Client ID aplikace MojeBegina | ne (ale nesdílet) |
| `IDOKLAD_CLIENT_SECRET` | nový Client Secret | **ano (Sensitive)** |
| `IDOKLAD_REDIRECT_URI` | `https://mojebegina-git-feature-finance-1-0-jarin-max.vercel.app/api/idoklad/callback` (adresu větve ověřit ve Vercelu; musí být i v iDokladu mezi Redirect URI) | ne |
| `IDOKLAD_OAUTH_STATE_SECRET` | náhodný řetězec ≥ 32 znaků (`openssl rand -base64 32`) | **ano (Sensitive)** |
| `FINANCE_COMPANY_ICO` | IČO Beginy (volitelné — označí, zda jde o agendu Beginy) | ne |
| `FINANCE_VAT_MODE` | `non_payer` (volitelné — porovná se s iDokladem) | ne |

V Production se nic nenastavuje. Test se musí spustit z adresy větve
(`mojebegina-git-feature-finance-1-0-jarin-max.vercel.app`), ne
z adresy konkrétního nasazení — jinak by cookie se `state` při návratu
chyběla (route sama přesměruje na adresu větve).

**Dopad na návrh synchronizace (oddíly 5 a 9):** s Authorization Code
neurčují agendu přístupové údaje aplikace, ale **uživatel, který se
přihlásí**. Trvalá synchronizace bude potřebovat refresh token
(`offline_access`) uložený šifrovaně v DB (vzor `googleCalendarCrypto.ts`)
— to je samostatné rozhodnutí před migrací. Pojistka IČO agendy
(`assertAgendaAllowed`) zůstává.

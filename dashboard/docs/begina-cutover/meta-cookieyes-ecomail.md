# Meta Pixel, CookieYes, Ecomail — co zachovat při přechodu z WordPressu

Stav: **příprava schválena 10. 10. 2026, implementováno za vypnutými
přepínači** (oddíl „Implementace“ níže). Zapnutí zatím neschváleno.
Zjištěno 10. 10. 2026 jen čtením veřejných
stránek www.begina.cz (úvod, `/produkt/kulajda/`, `/kosik/`,
`/landing-page/`; `/pokladna/` s prázdným košíkem přesměruje na košík).
Do administrace WordPressu, Meta ani Ecomailu jsem nepřistupoval.

## Co dnes běží na WordPressu

| Nástroj | Zjištění | Jistota |
|---|---|---|
| **Meta Pixel** | ID **2509610956071494** (veřejné, není tajné). Vložen ručně do hlavičky každé stránky (blok „Meta Pixel Code“, ne doplněk). Posílá **jen `PageView`** — žádné `ViewContent`, `AddToCart`, `InitiateCheckout` ani `Purchase` v HTML. | ověřeno z HTML |
| Pixel × souhlas | Kód pixelu **není** označen pro blokování (`data-cookieyes`, `type="text/plain"` chybí) → spouští se hned. Zda ho zastaví automatické blokování CookieYes, z HTML nepoznám (skript CookieYes je z cdn-cookieyes.com, ze sandboxu nedostupný). | **neověřeno** |
| **CookieYes** | Cloudový účet (skript `cdn-cookieyes.com/client_data/5f3760f1…/script.js`) + doplněk „cookie-law-info“. Google Consent Mode v2: výchozí stav vše `denied` kromě nezbytných, čekání 2 s. Kategorie: nezbytné, funkční, analytické, reklamní. | ověřeno z HTML |
| **Ecomail** | Doplněk Ecomail pro WooCommerce. `cartTrackingEnabled: false`, `lastProductTrackingEnabled: false` → **opuštěné košíky ani prohlížené produkty se nesledují**. Na webu není měřicí skript Ecomailu (`ecotrack`). Co doplněk posílá při objednávce (zápis zákazníků do seznamu, se souhlasem / bez), je jen v administraci. | částečně |
| Begina club (`/landing-page/`) | Formulář Elementor Pro „New Form“: jméno + e-mail, **bez zaškrtávacího souhlasu**. Kam data odcházejí (Ecomail / e-mail / jen WordPress), je v nastavení formuláře. | částečně |
| Ostatní | Google Analytics, Tag Manager, Google Ads ani ověření Search Console v HTML **nejsou**. | ověřeno |

Nový e-shop dnes **nemá žádné měření ani cookie lištu** (žádné marketingové
cookies → lišta zatím ze zákona nutná není). Zásady ochrany osobních údajů
(`lib/eshop/content/ochranaOsobnichUdaju.ts`, kap. VIII) ale lištu
s nastavením zmiňují — po přidání pixelu musí lišta existovat.

## Co zachovat — doporučení (nejlepší varianta první)

### 1. Meta Pixel — nutné před přepnutím DNS (jinak reklamy ztratí data)

**Doporučuji:** stejné ID 2509610956071494, načtené **až po souhlasu
s reklamními cookies**, a rovnou s událostmi e-shopu:
`PageView`, `ViewContent` (detail produktu), `AddToCart`,
`InitiateCheckout` (pokladna), `Purchase` (až po úplném zaplacení, ze
serveru, jen jednou, hodnota v Kč bez osobních údajů). Implementuji v kódu za přepínačem
(výchozí vypnuto), otestuji na Preview v Meta Events Manager → Test Events.

- Výhoda: stejný pixel = publika a historie zůstanou; Meta konečně uvidí
  nákupy (dnes vidí jen návštěvy).
- Později (volitelné): Conversions API ze serveru — přesnější, ale potřebuje
  přístupový token v Vercelu.
- Alternativa: přenést jen `PageView` jako dnes (méně práce, žádný přínos).

### 2. Cookie lišta — nutná spolu s pixelem

**Doporučuji: ponechat CookieYes** (stejný účet). Seznam cookies si sám
skenuje, ukládá záznamy souhlasů (důkaz pro kontrolu) a zásady na „nastavení
cookie lišty“ už odkazují. V kódu jen vložit jeho skript a pixel navázat
na kategorii „reklamní“.

- Potřeba: v účtu CookieYes změnit/přidat web **begina.cz** (dnes
  www.begina.cz) — u bezplatného tarifu ověřit limit domén a zobrazení.
- Alternativa: vlastní jednoduchá lišta v kódu (bez externí služby
  a poplatků), ale bez automatického skenu a záznamu souhlasů na serveru.

### 3. Ecomail — nepoužívá se (potvrzeno vedením 10. 10. 2026)

Nic se nepřenáší. Doplněk Ecomail na WordPressu lze kdykoli vypnout.
Formulář Begina club (`/landing-page/`) → úvod, jak je nastaveno.

## Implementace (za přepínači, výchozí VYPNUTO)

Kód: `lib/eshop/marketing.ts` (přepínače, nákup ze serveru),
`lib/eshop/metaPixel.ts` (prohlížeč), `components/eshop/Marketing.tsx`,
`MetaViewContent.tsx`; události v `AddToCartButton.tsx` a pokladně.

| Proměnná (Vercel) | Hodnota | Účinek |
|---|---|---|
| `ESHOP_MARKETING` | `on` | hlavní přepínač; cokoli jiného = nic se nenačte |
| `ESHOP_COOKIEYES_ID` | `5f3760f1f9ac1d11074e41aade2c6467` (kód webu z CookieYes) | cookie lišta + „Nastavení cookies“ v patičce |
| `ESHOP_META_PIXEL_ID` | `2509610956071494` | pixel — **jen** s CookieYes a **jen** po souhlasu |
| `ESHOP_META_CAPI_TOKEN` | tajný token (jen Vercel) | Purchase ze serveru po úplném zaplacení |

Hodnoty jsou veřejné (stojí v HTML každé stránky webu), nejsou tajné.
Platí jen pro stránky e-shopu, nikdy pro MojeBegina.

**Souhlas:** dokud zákazník v liště nepovolí kategorii „Reklamní“
(advertisement), skript Meta se **vůbec nenačte** a nic neodchází. Po
souhlasu se odešle zobrazení otevřené stránky; události před souhlasem se
zpětně neposílají. Odvolání souhlasu („Nastavení cookies“) → `consent revoke`
a žádné další události. Automatické události Meta (kliknutí, změny adresy)
jsou vypnuté — odchází jen naše.

**Stránka objednávky** (`/objednavka/<id>`): náhodné id v adrese je
jediný klíč k objednávce → na ní se nenačte CookieYes ani Meta a nic se
neodešle (jinak by Meta dostala adresu).

**Purchase = dokončený nákup** (oprava z auditu 11. 10. 2026 — dřív se
posílal už při vytvoření objednávky, tedy i za nezaplacený převod a za
kartu ještě před platbou):
- prohlížeč Purchase **neposílá** vůbec;
- pokladna k objednávce uloží jen **udělený** souhlas s reklamními cookies,
  cookie `_fbp`/`_fbc` (vzniknou jen po souhlasu) a prohlížeč (user agent)
  — žádné jméno, e-mail, telefon ani IP; bez souhlasu se neuloží nic;
- **server** (`lib/eshop/metaPurchase.ts`, Meta Conversions API) pošle
  Purchase **až po úplném zaplacení**: karta (webhook Stripe), převod
  i hotovost („Zapsat platbu“ v MojeBegina), náhradní objednávka uhrazená
  převodem ze stornované (souhlas z původní objednávky);
- nikdy za vytvořenou, částečně zaplacenou ani stornovanou objednávku;
- **jednou:** pod zámkem objednávky se nejdřív zapíše záznam „meta_purchase“
  (druhý webhook, souběh, opakování = nic), `event_id = objednavka-<VS>`
  (Meta deduplikuje), náhradní objednávka se nezapočte, pokud už nákup
  poslala původní; adresa události = `https://begina.cz/pokladna`
  (nikdy adresa objednávky s tajným id);
- výsledek je v historii objednávky v MojeBegina; chyba Meta platbu ani
  objednávku nezmění a znovu se neposílá;
- hodnota = celková cena v Kč vč. dopravy.

Přepínač navíc: **`ESHOP_META_CAPI_TOKEN`** (tajný token z Meta Events
Manager → Nastavení → Conversions API; zadat **jen do Vercelu**, ne do
chatu). Bez něj se Purchase neposílá vůbec (ostatní události ano).
Volitelně `ESHOP_META_TEST_EVENT_CODE` (TEST…) pro ověření v Test Events.

Zbývající omezení: souhlas platí k okamžiku objednávky (odvolá-li ho
zákazník mezi objednávkou a platbou, server to neví); vrácení peněz se do
Meta neposílá.

**Ověřeno:** `lib/eshop/__tests__/marketing.test.ts`,
`components/__tests__/Marketing.test.tsx` a prohlížeč
`scripts/eshop-e2e/marketing.mjs` (CookieYes i Meta nahrazené
napodobeninou, nic neodchází ven; zapnuto 53/53, vypnuto 36/36),
`lib/eshop/__tests__/metaPurchase.test.ts`
(server: po zaplacení jednou, souběh, bez souhlasu, storno, chyba Meta,
náhradní objednávka).

**Před zapnutím (Production):**
1. CookieYes: přidat begina.cz; v liště ověřit kategorii „Reklamní“
   a vypnout automatické blokování pro Meta (pixel blokujeme sami).
2. Zapnout nejdřív na Preview, ověřit v Meta Events Manager → Test Events.
3. Production: proměnné výše → Redeploy (spolu s přepnutím DNS, ne dřív —
   CookieYes je vázaný na doménu).
4. Pak vypnout Meta Pixel na WordPressu (jinak by se po návratu měřilo
   bez souhlasu).

## Co potřebuji od vás

1. **Meta Business → Events Manager → pixel 2509610956071494:** jen
   potvrdit, že je to jediný pixel (screenshot přehledu stačí).
2. **CookieYes (app.cookieyes.com):** tarif a jestli jde přidat begina.cz
   (screenshot nastavení webu).
3. Schválit zapnutí na Preview (proměnné pro Preview) a pak na Production.

## Vedlejší zjištění pro číslování

Šablona Elementoru má ID **5100** → čísla WooCommerce jsou ID WordPressu
(potvrzeno: #5202 → #5206 skáče). Nový e-shop proto dostane vlastní řadu
70000001+ (`ESHOP_CISLOVANI_PRECHOD.md`).

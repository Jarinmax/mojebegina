# Meta Pixel, CookieYes, Ecomail — co zachovat při přechodu z WordPressu

Stav: **NÁVRH ke schválení.** Zjištěno 10. 10. 2026 jen čtením veřejných
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
`InitiateCheckout` (pokladna), `Purchase` (stránka objednávky, jen jednou,
hodnota v Kč bez osobních údajů). Implementuji v kódu za přepínačem
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

## Co potřebuji od vás

1. **Meta Business → Events Manager → pixel 2509610956071494:** jen
   potvrdit, že je to jediný pixel (screenshot přehledu stačí).
2. **CookieYes (app.cookieyes.com):** tarif a jestli jde přidat begina.cz
   (screenshot nastavení webu).

## Vedlejší zjištění pro číslování

Šablona Elementoru má ID **5100** → čísla WooCommerce jsou ID WordPressu
(potvrzeno: #5202 → #5206 skáče). Nový e-shop proto dostane vlastní řadu
70000001+ (`ESHOP_CISLOVANI_PRECHOD.md`).

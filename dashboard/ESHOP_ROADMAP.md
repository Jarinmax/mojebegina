# E-shop Begina — stav a plán

Vlastní e-shop jako náhrada WordPressu/WooCommerce na begina.cz. Stojí
přímo v této appce (stejný Next.js, stejná Neon DB, stejné přihlašování),
aby objednávky z webu končily rovnou v Objednávkách a CRM, bez
synchronizace mezi dvěma systémy.

## Hotovo — E-shop 1.0 (náhled)

Veřejně bez přihlášení na `/eshop`, zatím `noindex` a nikde neodkazováno.

- Katalog `/eshop` a detail produktu `/eshop/produkt/[slug]` se sekcí
  „Informace o potravině“ (balení, složení, alergeny, výživové hodnoty,
  skladování, trvanlivost).
- Košík `/eshop/kosik` v localStorage (drží jen slug + množství).
- Pokladna `/eshop/pokladna`: kontakt, způsob doručení (adresa jen u
  rozvozu), platba, souhlas s obchodními podmínkami, rekapitulace.
- Cena se počítá výhradně na serveru z katalogu (`lib/eshop/pricing.ts`),
  podvržená cena z prohlížeče se ignoruje. Testy v `lib/eshop/__tests__`.

**Objednávka se zatím nikam neukládá ani neodesílá** — jen se zobrazí
rekapitulace.

## Co potřebujeme od vedení

1. **Údaje o produktech** — velikost balení, složení, alergeny, výživové
   hodnoty, skladování, trvanlivost, fotky (`lib/eshop/catalog.ts`; dokud
   něco chybí, `isFoodInfoComplete` vrací false). U potravin povinné před
   nákupem (nařízení EU 1169/2011).
2. **Je cena 379 Kč s DPH?** A je to cena pro koncové zákazníky, nebo
   velkoobchodní?
3. **Doprava** — skutečné způsoby, ceny, rozvozové dny a oblasti
   (`lib/eshop/shipping.ts`, dnes orientační hodnoty).
4. **Platební brána** (Comgate / GoPay / Stripe) a číslo účtu pro převod.
5. **Obchodní podmínky, reklamační řád, zásady ochrany osobních údajů.**

## Další fáze

- **Uložení objednávky do `orders`.** `orders.buyerOrganizationId` je
  dnes NOT NULL a `organizations.ico` NOT NULL UNIQUE — koncový zákazník
  bez IČO se tam nevejde. Návrh: udělat `buyerOrganizationId` nullable,
  u e-shopových objednávek vyplnit `contact*` + `recipient*` snapshot
  a přidat sloupec `channel` („eshop“ / „manual“). Nutná migrace +
  kontrola všech míst, která s organizací počítají.
- Ochrana formuláře proti spamu (rate limit, honeypot).
- Potvrzovací e-mail zákazníkovi a upozornění pro Beginu.
- Platební brána, QR platba u převodu.
- Faktura (napojení na `invoices` / eDoklad).
- Velkoodběratelé: přihlášený zákazník z organizace vidí své ceny
  a objednává na fakturu (`placedByUserId`).
- Přechod z WordPressu: přesměrování starých URL (301), sitemap, feed pro
  Heureku/Zboží.cz, analytika, souhlas s cookies. Pak zrušit `noindex`.

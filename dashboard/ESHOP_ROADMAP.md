# E-shop Begina — stav a plán

Vlastní e-shop jako náhrada WordPressu/WooCommerce na begina.cz. Stojí
přímo v této appce (stejný Next.js, stejná Neon DB, stejné přihlašování),
aby objednávky z webu končily rovnou v Objednávkách a CRM, bez
synchronizace mezi dvěma systémy.

## Hotovo — E-shop 1.0 (náhled)

Veřejně bez přihlášení na `/eshop`, zatím `noindex` a nikde neodkazováno.

- Úvod `/eshop` čistý jako dnešní begina.cz (úvodní text, 5 dlaždic
  kategorií, „Proč Begina“), stránky kategorií `/eshop/kategorie/[slug]`
  s produkty. Fotky kategorií jsou oříznuté ze screenshotu — lepší by
  byly originály.
- Detail produktu `/eshop/produkt/[slug]` s výběrem balení a sekcí „Informace o
  potravině“ (balení, složení, alergeny, obsah alkoholu, výživové hodnoty,
  skladování, trvanlivost).
- Produkty: 3 polévky (z DB), 4 alkoholické koktejly z begina.cz (Svařák
  Deluxe, Lady Carneval a Kosmopolitan s kompletními texty, Granátový
  Bond bez úvodního popisu a předností).
- Košík `/eshop/kosik` v localStorage (drží jen sku balení + množství).
- Alkohol v košíku → pokladna vyžaduje potvrzení 18+ (hlídá i server).
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
2. **Produkty ostatních kategorií** — bylinné sirupy, čaje, ovocné
   nápoje (název, cena, balení, texty, fotky). Kategorie podle begina.cz
   už v e-shopu jsou, zatím s „Nabídku doplníme“.
   **Koktejly:** ceny balení potvrzené cenou za nápoj na webu (3 l =
   15 nápojů). U Granátového Bonda chybí úvodní popis a přednosti
   (horní část stránky na begina.cz).
   **K rozhodnutí — Lady Carneval:** begina.cz uvádí „bez umělých aromat
   a barviv“, ale složení (Aperol) obsahuje aromata a barviva E110, E124.
   V e-shopu je tahle přednost zatím vynechaná. Barviva E110 a E124 navíc
   vyžadují povinné upozornění „může nepříznivě ovlivňovat činnost
   a pozornost dětí“ (nařízení 1333/2008, příloha V) — ověřit.
   **Alergeny u svařáku:** víno obvykle obsahuje siřičitany, které se musí
   uvádět — ověřit.
3. **Červánkové nebe** (349 Kč) — prodává se na begina.cz, ale nemáme
   jeho stránku: do jaké kategorie patří, balení, texty, fotka.
   (Cena polévek 379 Kč je potvrzená jako maloobchodní skutečnou
   objednávkou z e-shopu.)
4. **Doprava** — podle begina.cz se cena chlazené přepravy počítá
   podle celkového objemu objednávky; potřebujeme tabulku (objem → cena),
   rozvozové dny a oblasti (`lib/eshop/shipping.ts`, dnes paušál 99 Kč).
5. **Platební brána** (Comgate / GoPay / Stripe) a číslo účtu pro převod.
6. **Obchodní podmínky, reklamační řád, zásady ochrany osobních údajů.**

## Další fáze

- **Uložení objednávky do `orders`.** `orders.buyerOrganizationId` je
  dnes NOT NULL a `organizations.ico` NOT NULL UNIQUE — koncový zákazník
  bez IČO se tam nevejde. Návrh: udělat `buyerOrganizationId` nullable,
  u e-shopových objednávek vyplnit `contact*` + `recipient*` snapshot
  a přidat sloupec `channel` („eshop“ / „manual“). Nutná migrace +
  kontrola všech míst, která s organizací počítají.
- Alkoholické koktejly: potvrzení 18+ v pokladně už je; zbývá ověření
  věku při předání (dopravce/řidič) a kontrola oprávnění k prodeji.
- Ochrana formuláře proti spamu (rate limit, honeypot).
- Potvrzovací e-mail zákazníkovi a upozornění pro Beginu.
- Platební brána, QR platba u převodu.
- Faktura (napojení na `invoices` / eDoklad).
- Velkoodběratelé: přihlášený zákazník z organizace vidí své ceny
  a objednává na fakturu (`placedByUserId`).
- Číslování objednávek navázat na WooCommerce (dnes kolem č. 5093), ať
  zákazníci ani účetnictví nevidí skok nebo duplicitu.
- Přechod z WordPressu: přesměrování starých URL (301), sitemap, feed pro
  Heureku/Zboží.cz, analytika, souhlas s cookies. Pak zrušit `noindex`.

# E-shop Begina — stav a plán

Vlastní e-shop jako náhrada WordPressu/WooCommerce na begina.cz. Zatím
v jednom Next.js projektu s MojeBegina (rozhodnutí 26. 9. 2026), modulárně
v `app/eshop`, `components/eshop`, `lib/eshop`, aby šel později oddělit
(`MONOREPO_PLAN.md` = odložená možnost). Jediný zdroj pravdy je Neon DB;
objednávky z webu budou končit rovnou v Objednávkách MojeBegina.

## Kde co běží (kontrolovat před každým testem)

| | Git větev | Vercel Preview | Neon větev |
|---|---|---|---|
| **E-shop 1.0** | `claude/great-bell-ffjwo3` | `mojebegina-git-claude-great-bell-ffjwo3-jarin-max.vercel.app` | `preview/claude/great-bell-ffjwo3` (`br-curly-base-b2blmhjg`) — e-shopové migrace 0013–0019 spuštěné |
| CEO přehled 1.0 | `feature/ceo-focus-1-0` (sloučeno do `main`) | `mojebegina-git-feature-ceo-focus-1-0-jarin-max.vercel.app` | `preview/feature/ceo-focus-1-0` (`br-restless-smoke-b2fbn0pr`) |
| Produkce | `main` | `moje.begina.cz` | `main` — migrace 0000–0012 (vč. CEO přehledu a Denního volání), e-shopové **nespuštěné** |

**Přečíslování migrací:** e-shopová větev se pravidelně slučuje s `main`.
Když `main` přinese novou migraci, e-shopové migrace se posunou za ni
(SQL obsah beze změny, snapshoty Drizzle doplněné o nové tabulky z main).
- 29. 9. 2026: `0011_phase_17_ceo_focus` (CEO přehled) → e-shop 0011–0017 → 0012–0018.
- 1. 10. 2026: `0012_phase_19_daily_calls` (Denní volání) → e-shop 0012–0018 → **0013–0019**.

Na Preview Neonu jsou e-shopové migrace spuštěné pod původními čísly —
**znovu je nespouštět**; na Preview se doplňují jen migrace z main.
Souvislost řetězce hlídá `lib/eshop/__tests__/migrationChain.test.ts`.
Ostatní dokumenty `ESHOP_*.md` už uvádějí aktuální čísla.

Staré Preview (např. `…-z3ice0-…` = `claude/affectionate-fermi-z3ice0`,
už sloučená) běží se starým kódem a vlastní testovací DB — netestovat na nich.

## Hotovo — E-shop 1.0 (náhled)

Veřejně bez přihlášení na `/eshop`, zatím `noindex` a nikde neodkazováno.

- Úvod `/eshop` čistý jako dnešní begina.cz (úvodní text, 5 dlaždic
  kategorií, „Proč Begina“), stránky kategorií `/eshop/kategorie/[slug]`
  s produkty. Fotky kategorií jsou oříznuté ze screenshotu — lepší by
  byly originály.
- Detail produktu `/eshop/produkt/[slug]` s výběrem balení a sekcí „Informace o
  potravině“ (balení, složení, alergeny, obsah alkoholu, výživové hodnoty,
  skladování, trvanlivost).
- **Produkty 1.0 (26. 9. 2026): katalog se čte z DB** (tabulky
  `product_categories`, `products`, `product_variants`, `product_images`,
  migrace 0013 + 0014). `catalog.ts` už jen zdroj prvního naplnění.
- Produkty: 3 polévky (z DB), 4 alkoholické koktejly z begina.cz (Svařák
  Deluxe, Lady Carneval a Kosmopolitan s kompletními texty, Granátový
  Bond bez úvodního popisu a předností).
- Košík `/eshop/kosik` v localStorage (drží jen sku balení + množství).
- Alkohol v košíku → pokladna vyžaduje potvrzení 18+ (hlídá i server).
- Pokladna `/eshop/pokladna`: kontakt, způsob doručení (adresa jen u
  rozvozu), platba, souhlas s obchodními podmínkami, rekapitulace.
- Cena se počítá výhradně na serveru z katalogu (`lib/eshop/pricing.ts`),
  podvržená cena z prohlížeče se ignoruje. Testy v `lib/eshop/__tests__`.

- **Kroky 3–5 (27. 9. 2026, migrace 0015–0017, zatím jen na větvi):**
  systémový zápis do historie objednávky (`order_activity.actor_type`),
  nová pole `orders` (kanál, poznámka zákazníka, doprava, platba, sleva,
  souhlasy) a vazba `order_items` na balení/SKU. Postup:
  `ESHOP_OBJEDNAVKY_KROKY_3_5.md`.
- **Platba kartou — Stripe (28. 9. 2026, testovací režim, jen Preview,
  bez migrace):** Stripe Checkout, webhook s ověřením podpisu, idempotentní
  přepnutí na Zaplaceno + historie, zaplatit znovu. Production vypnuto.
  Nastavení Stripe/Vercel a první testovací platba: `ESHOP_STRIPE.md`.
- **Navigace (28. 9. 2026):** tlačítko „E-shop Begina.cz“ jen u nadpisu
  Řízení firmy (horní lišty a zákaznická karta záměrně bez — e-shop je
  zatím pro koncové zákazníky, partneři by nakoupili za maloobchodní ceny
  mimo svůj účet; vrátit až s B2B nákupem). Cíl: `lib/eshopLink.ts` (dnes
  `/eshop`; přepnutí na begina.cz = `NEXT_PUBLIC_ESHOP_URL=https://begina.cz`
  ve Vercelu + nové nasazení, externí adresa v nové záložce).
- **Pokladna ukládá objednávky (28. 9. 2026, jen Preview, bez migrace):**
  objednávka bez organizace + položky napojené na balení se snapshoty +
  systémový záznam „E-shop“; stav nová / nezaplacená; bez čísla, platby
  a e-mailu. V Production se neukládá. Postup: `ESHOP_POKLADNA_ZAPIS.md`.
- **Potvrzovací e-maily (1. 10. 2026, Resend, jen Preview, bez migrace):**
  zákazníkovi potvrzení (převod hned, karta až po potvrzení platby
  Stripe — jedna zpráva), Begině interní upozornění s odkazem do
  MojeBegina. Preview posílá jen na testovací adresy, Production nic.
  Nastavení Resend/DNS/Vercel a test: `ESHOP_EMAILY.md`.
- **Převod + QR platba + číslování (2. 10. 2026, jen Preview, bez drizzle
  migrace):** číslo objednávky z DB (Preview řada od 900001, Production až
  v den přepnutí), VS = číslo, splatnost 5 dní + „Po splatnosti“
  v MojeBegina, QR Platba na stránce objednávky i v e-mailu, e-mail
  „Platbu jsme přijali“ po ručním Zaplaceno. Postup: `ESHOP_PREVOD_QR.md`.
- **Kroky 6a + 7 (28. 9. 2026, migrace 0018–0019, jen na větvi):** číslo
  objednávky (sloupec, číslování zatím vypnuté) a objednávka bez
  organizace (soukromý zákazník); MojeBegina je umí zobrazit. Postup:
  `ESHOP_OBJEDNAVKY_KROKY_6A_7.md`.

**Objednávka se ukládá jen v Preview** (viz výše); v Production zatím jen
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
5. **Platby:** NOVÝ samostatný Stripe účet „Begina“ (dnešní begina.cz
   používá WooPayments — ten je svázaný s WooCommerce a vlastní API klíče
   nedává). Testovací režim hned, ostré platby po ověření firmy ve Stripe.
   Viz `ESHOP_STRIPE.md`; číslo účtu pro převod (QR).
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
- Automatické párování plateb z banky (např. Fio API).
- Faktura (napojení na `invoices` / eDoklad).
- Velkoodběratelé: přihlášený zákazník z organizace vidí své ceny
  a objednává na fakturu (`placedByUserId`).
- Číslování objednávek: rozhodnuto tvrdé přepnutí — v den spuštění vypnout
  pokladnu WooCommerce, nová řada začne na MAX + 1, společná pro e-shop
  i ruční objednávky (viz `ESHOP_SCHEMA_PROPOSAL.md`, oddíl 4).
- Přechod z WordPressu: přesměrování starých URL (301), sitemap, feed pro
  Heureku/Zboží.cz, analytika, souhlas s cookies. Pak zrušit `noindex`.

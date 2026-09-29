# Produkty 1.0 — co se změnilo a jak to nasadit

Stav: implementováno na větvi `claude/great-bell-ffjwo3` (26. 9. 2026).
**Migrace 0012 + 0013 spuštěné vedením na Neon Preview větvi
`preview/claude/great-bell-ffjwo3` (`br-curly-base-b2blmhjg`) 27. 9. 2026
a ověřené read-only** (5 / 7 / 11 / 4; katalog bajtově shodný s testovací
DB). **Produkční `main` beze změny.** Claude má k Neonu jen read-only
přístup — migrace spouští vedení.

## Co se změnilo

- `lib/db/schema.ts`: nové tabulky `product_categories`, `products`,
  `product_variants`, `product_images` (+ `ALLERGEN_CODES`). Existující
  tabulky beze změny.
- `drizzle/0012_eshop_1_0_products.sql` — vytvoření tabulek (vygenerováno
  `drizzle-kit generate`, obsahuje jen nové tabulky).
- `drizzle/0013_eshop_1_0_products_seed.sql` — první naplnění z
  `lib/eshop/catalog.ts` (5 kategorií, 7 produktů, 11 SKU, 4 fotky),
  generuje `scripts/eshop-seed/generate-seed-sql.ts`, idempotentní.
- E-shop (`/eshop/*`) čte katalog **jen z DB** (`lib/eshop/catalogDb.ts`,
  `catalogServer.ts`); prohlížeč dostává katalog z DB přes
  `CatalogProvider`. Cena, košík i pokladna pracují s katalogem z DB.
  `catalog.ts` zůstává jen pro seed a test parity (nesmazán).
- Když DB nebo migrace chybí, e-shop ukáže „E-shop je dočasně nedostupný“
  (chyba jde do logu) — MojeBegina se to netýká.
- Dev závislost `@electric-sql/pglite` (jen testy) a
  `scripts/eshop-e2e/neon-http-pglite.mjs` (ověření v prohlížeči bez Neonu).

## Nasazení — nejdřív testovací větev Neonu

1. V Neon Console vytvořit branch z `main` (nebo použít preview větev,
   kterou Vercel vytvořil pro tuto git větev).
2. Kontrola, že tabulky ještě neexistují (0 řádků):
   `docs/eshop-schema-draft/00_preflight_checks.sql`, dotaz 0.4.
3. V SQL Editoru na té větvi spustit **celý obsah**
   `drizzle/0012_eshop_1_0_products.sql`, pak
   `drizzle/0013_eshop_1_0_products_seed.sql`.
4. Kontrola: `docs/eshop-schema-draft/99_postflight_checks.sql` (první
   dotaz: 5 / 7 / 11 / 4; druhý: 0 řádků).
5. Otevřít Vercel preview této větve → `/eshop` musí ukázat katalog.
6. Až po schválení totéž na `main` (produkce). **Nemergovat větev do
   `main` dřív, než migrace proběhnou na produkční DB** — e-shop by jinak
   ukazoval „dočasně nedostupný“ (MojeBegina by fungovala dál).

**Návrat:** `docs/eshop-schema-draft/02_products_seed_down.sql`, pak
`01_products_down.sql` (vratné, dokud na balení neodkazuje žádná
objednávka — to přijde až krokem 5 schématu).

## Ověřeno (26. 9. 2026, bez Neonu)

- 259/259 testů (220 MojeBegina beze změny + 39 e-shop, z toho 10
  integračních na PGlite se skutečnými migracemi 0000–0013):
  parita DB ↔ catalog.ts, idempotence seedu, CHECK omezení, skrytí
  neaktivních položek, alergeny/výživové hodnoty, **schéma objednávek, CRM,
  uživatelů a Řízení firmy po migracích beze změny**, a že běžící e-shop
  neimportuje `catalog.ts`.
- Typecheck + lint + `next build`: seznam rout MojeBegina beze změny
  (e-shop je nově dynamický).
- Prohlížeč (Playwright, mobil + desktop) proti DB v paměti přes skutečný
  ovladač Neonu: katalog, detail, výběr balení, košík, pokladna, 18+,
  potvrzení; bez chyb v konzoli; bez DB se ukáže zpráva o nedostupnosti.
- Stránky MojeBegina bez přihlášení přesměrují na `/login` jako dřív.

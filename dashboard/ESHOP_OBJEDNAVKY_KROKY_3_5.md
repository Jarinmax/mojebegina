# ESHOP 1.0, kroky 3–5 — objednávky připravené na e-shop

Stav: **implementováno na větvi `claude/great-bell-ffjwo3`, NEMIGROVÁNO
na Neon** (27. 9. 2026). Claude má k Neonu jen read-only přístup —
migrace spouští vedení. Návrh a zdůvodnění: `ESHOP_SCHEMA_PROPOSAL.md`,
oddíly 3.7, 3.8 a 3.10.

**Co to NENÍ:** objednávka bez organizace (krok 7), číslo objednávky
(krok 6) ani ostrý checkout. `orders.buyer_organization_id` zůstává
NOT NULL, e-shop zatím nic neukládá.

## Co se změnilo

| Migrace | Tabulka | Změna |
|---|---|---|
| `0013_eshop_1_0_order_activity_actor` | `order_activity` | `actor_type` (`user` / `system` / `customer`, výchozí `user`); `author_user_id` smí být NULL, ale jen u systému a zákazníka (CHECK) |
| `0014_eshop_1_0_orders_fields` | `orders` | `channel` (`manual` / `eshop` / `import`, výchozí `manual`), `customer_note`, `shipping_method_code/label`, `payment_method_code/label`, `discount_kc` (výchozí 0), `age_confirmed_at`, `terms_accepted_at`; CHECK celkem = zboží − sleva + doprava; 2 objednávky The Cup → `import` (podle id) |
| `0015_eshop_1_0_order_items_variant` | `order_items` | `product_variant_id` (FK na balení, RESTRICT — prodané balení nejde smazat) + index, `sku_snapshot`; CHECK množství > 0, řádek = množství × cena, vazba ⇒ SKU |

Kód: `lib/db/schema.ts` (tytéž sloupce a omezení), `lib/data/orders.ts`
(historie nese `actorType`), `OrderActivityTimeline.tsx` (záznam bez
jména ukáže „Systém“ / „Zákazník“). Ruční zakládání objednávek
v MojeBegina se nemění — výchozí hodnoty odpovídají dnešnímu chování.

## ⚠ Pořadí: nejdřív migrace, potom kód

Kód této větve čte nové sloupce `orders` a `order_activity`. **Na
databázi bez migrací 0013–0015 spadne Řízení firmy (dlaždice objednávek)
i Objednávky.** Starému produkčnímu kódu nové sloupce nevadí (migrace jsou
zpětně kompatibilní), proto:

- **Preview:** migrace spustit na Preview větvi hned (Preview s tímto
  kódem do té doby hlásí chybu v Objednávkách; e-shop a CRM běží).
- **Produkce:** migrace na Neon `main` **před** mergem větve do `main`.

## Nasazení na Preview větev `preview/claude/great-bell-ffjwo3`

Neon Console → projekt mojeBegina-db → větev
`preview/claude/great-bell-ffjwo3` (`br-curly-base-b2blmhjg`) → SQL Editor.

1. **Kontrola před** (jen čtení):

   ```sql
   SELECT
     (SELECT count(*) FROM product_variants) AS baleni,
     (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND (
        (table_name = 'order_activity' AND column_name = 'actor_type') OR
        (table_name = 'orders' AND column_name = 'channel') OR
        (table_name = 'order_items' AND column_name = 'product_variant_id'))) AS nove_sloupce,
     (SELECT count(*) FROM order_items WHERE quantity <= 0 OR line_total_kc <> quantity * unit_price_kc) AS spatne_polozky,
     (SELECT count(*) FROM orders WHERE total_kc <> subtotal_kc + shipping_kc) AS spatne_soucty,
     (SELECT count(*) FROM order_activity WHERE author_user_id IS NULL) AS aktivita_bez_autora,
     (SELECT count(*) FROM orders) AS objednavky,
     (SELECT count(*) FROM order_items) AS polozky;
   ```

   Očekáváno (ověřeno read-only 27. 9. 2026): **11 / 0 / 0 / 0 / 0 / 2 / 5**.
   `baleni = 11` znamená, že Produkty 1.0 už na větvi jsou (krok 5 na ně
   odkazuje). Cokoli jiného → nespouštět a ozvat se.

2. **Migrace** v tomto pořadí, vždy celý obsah souboru:
   `drizzle/0013_eshop_1_0_order_activity_actor.sql`,
   `drizzle/0014_eshop_1_0_orders_fields.sql`,
   `drizzle/0015_eshop_1_0_order_items_variant.sql`.

3. **Kontrola po:**

   ```sql
   SELECT
     (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND (
        (table_name = 'order_activity' AND column_name = 'actor_type') OR
        (table_name = 'orders' AND column_name = 'channel') OR
        (table_name = 'order_items' AND column_name = 'product_variant_id'))) AS nove_sloupce,
     (SELECT count(*) FROM pg_constraint WHERE conname IN (
        'order_activity_actor_type_check', 'order_activity_user_has_author',
        'orders_channel_check', 'orders_discount_nonnegative', 'orders_total_consistent',
        'order_items_quantity_positive', 'order_items_line_total_consistent',
        'order_items_variant_has_sku', 'order_items_product_variant_id_product_variants_id_fk')) AS omezeni,
     (SELECT string_agg(channel || ': ' || n, ', ' ORDER BY channel)
        FROM (SELECT channel, count(*) AS n FROM orders GROUP BY channel) c) AS kanaly,
     (SELECT count(*) FROM orders) AS objednavky,
     (SELECT count(*) FROM order_items) AS polozky,
     (SELECT count(*) FROM order_items WHERE product_variant_id IS NOT NULL) AS polozky_s_vazbou;
   ```

   Očekáváno: **3 / 9 / `import: 2` / 2 / 5 / 0**.

4. Preview: Řízení firmy → Objednávky → detail objednávky The Cup se
   zobrazí jako dřív; založení ruční objednávky funguje.

**Návrat** (v tomto pořadí): `docs/eshop-schema-draft/05_order_items_variant_down.sql`,
`04_orders_eshop_fields_down.sql`, `03_order_activity_actor_down.sql`.
Vratné, dokud neexistuje systémový záznam v historii (krok 3) a položka
navázaná na balení (krok 5) — do spuštění e-shopu tedy vždy.

## Ověřeno (27. 9. 2026, bez Neonu)

- Katalog v Preview DB (`br-curly-base-b2blmhjg`) je **bajtově shodný**
  s katalogem v testovací DB (md5 kanonického výpisu všech 4 tabulek
  `539c0724…`), na kterém prošly testy parity s `catalog.ts` i e2e
  v prohlížeči.
- 272/272 testů (+13 nových na PGlite se skutečnými migracemi
  0000–0015 a daty jako v produkci): The Cup → `import`, součty a položky
  beze změny; schéma CRM, uživatelů, faktur, Řízení firmy a katalogu beze
  změny; objednávka bez organizace dál odmítnuta; systémový záznam bez
  autora projde, interní ne; e-shopová objednávka (objednávka + položka
  s vazbou + systémový záznam) v jedné transakci; prodané balení nejde
  smazat a historie drží SKU i po přejmenování; databáze odmítne nesedící
  součty, zápornou slevu, neznámý kanál, vazbu bez SKU a nulové množství;
  návrat 05 → 04 → 03 vrátí schéma i data přesně.
- Typecheck, lint, `next build` bez chyb; seznam rout beze změny.

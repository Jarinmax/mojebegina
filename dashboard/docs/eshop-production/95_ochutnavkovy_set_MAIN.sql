-- Ochutnávkový set sirupů (11. 11. 2026, zadání Lucie): 5 × 100 ml v krabici.
-- ZAVÁDĚCÍ KAMPAŇ: 159 Kč + Zásilkovna zdarma pro prvních 100 setů, bez kódu.
-- Po 100 prodaných setech spustit 97_konec_kampane_set_MAIN.sql (249 Kč) + vrátit
-- ZASILKOVNA_PRICE_KC na 89 v lib/eshop/shipping.ts.
-- Nový produkt v kategorii Sirupy + jedno balení (SKU ochutnavkovy-set-sirupu-5x100ml),
-- bez alergenů. Doprava Zásilkovnou (v kampani zdarma, pak 89 Kč) jen pro košík se samotným setem — kód
-- v lib/eshop/shipping.ts (SKU musí sedět).
-- Složení a výživové údaje = etikety 100 ml (receptury, 11. 11. 2026).
-- Fotku doplníme po nafocení skutečné krabice.
--
-- SPUSTIT až po nasazení kódu (větev ochutnavkovy-set), CELÝ v Neon SQL Editoru
-- na větvi main, jen jednou. Vrácení: UPDATE products SET is_active = false WHERE slug = 'ochutnavkovy-set-sirupu';
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'ochutnavkovy-set-sirupu', 'Ochutnávkový set sirupů',
  'Zaváděcí cena 159 Kč a poštovné zdarma – jen prvních 100 setů. Pět bylinných sirupů po 100 ml na ochutnání: meduňka s levandulí, heřmánek, ibišek, lípa a zázvor.',
  ARRAY['Ochutnávkový set pěti bylinných sirupů Begina po 100 ml. Ideální, když chcete poznat naše chutě a vybrat si svůj oblíbený sirup na velké balení.', '**Set dodáváme v kartonové krabici, sirupy jsou v průhledných sáčcích (doypack) se šroubovacím uzávěrem a etiketou se složením.**', '## Co v setu najdete', '- Meduňkový sirup s levandulí – 100 ml', '- Heřmánkový sirup – 100 ml', '- Ibiškový sirup – 100 ml', '- Lipový sirup – 100 ml', '- Zázvorový sirup – 100 ml', '## Výživové údaje (na 100 ml)', '- **Meduňkový sirup s levandulí:** 1061 kJ / 250 kcal, tuky 0 g, z toho nasycené mastné kyseliny 0 g, sacharidy 62 g, z toho cukry 62 g, bílkoviny 0 g, sůl 0 g', '- **Heřmánkový sirup:** 1091 kJ / 257 kcal, tuky 0 g, z toho nasycené mastné kyseliny 0 g, sacharidy 64 g, z toho cukry 64 g, bílkoviny 0 g, sůl 0 g', '- **Ibiškový sirup:** 1124 kJ / 264 kcal, tuky 0 g, z toho nasycené mastné kyseliny 0 g, sacharidy 66 g, z toho cukry 66 g, bílkoviny 0 g, sůl 0 g', '- **Lipový sirup:** 1076 kJ / 253 kcal, tuky 0 g, z toho nasycené mastné kyseliny 0 g, sacharidy 63 g, z toho cukry 63 g, bílkoviny 0 g, sůl 0 g', '- **Zázvorový sirup:** 1061 kJ / 250 kcal, tuky 0 g, z toho nasycené mastné kyseliny 0 g, sacharidy 62 g, z toho cukry 62 g, bílkoviny 0 g, sůl 0 g', '## Jak sirup používat', '**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Ze 100 ml sirupu připravíte až 5 nápojů.', '## Doprava', '**Zaváděcí cena 159 Kč a poštovné zdarma platí jen pro prvních 100 setů, pak bude set za 249 Kč.** Samotný Ochutnávkový set posíláme Zásilkovnou na výdejní místo nebo do Z-BOXu. Sirupy nepotřebují chlazení.']::text[],
  ARRAY['5 sirupů po 100 ml', 'až 25 nápojů', 'bez umělých aromat a barviv', 'poštovné zdarma']::text[],
  NULL,
  'Meduňkový sirup s levandulí: třtinový cukr, bylinný výluh 39 % (čistá filtrovaná voda, meduňka (Melissa officinalis), květ levandule (Lavandula angustifolia)), citronová šťáva 13 %, antioxidant: kyselina askorbová (vitamin C). Heřmánkový sirup: třtinový cukr, bylinný výluh 40 % (čistá filtrovaná voda, květ heřmánku (Matricaria chamomilla)), citronová šťáva 10 %, antioxidant: kyselina askorbová (vitamin C). Ibiškový sirup: třtinový cukr, bylinný výluh 41 % (čistá filtrovaná voda, květ ibišku (Hibiscus sabdariffa)), citronová šťáva 8 %, antioxidant: kyselina askorbová (vitamin C). Lipový sirup: třtinový cukr, bylinný výluh 39 % (čistá filtrovaná voda, lipový květ (Tiliae flos)), citronová šťáva 11 %, antioxidant: kyselina askorbová (vitamin C). Zázvorový sirup: třtinový cukr, bylinný výluh 39 % (čistá filtrovaná voda, zázvor (Zingiber officinale)), citronová šťáva 13 %, antioxidant: kyselina askorbová (vitamin C).',
  NULL, '100ml',
  'Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.',
  '{}'::text[], '{}'::text[],
  'Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.',
  5)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "ingredients" = EXCLUDED."ingredients",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "allergens" = EXCLUDED."allergens", "shelf_life_note" = EXCLUDED."shelf_life_note",
  "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "weight_g", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'ochutnavkovy-set-sirupu'), 'ochutnavkovy-set-sirupu-5x100ml', '5 × 100 ml', 'Až 25 nápojů',
  '5 průhledných sáčků po 100 ml se šroubovacím uzávěrem v kartonové krabici.', 500, 25, 159, 800, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings", "price_b2c_kc" = EXCLUDED."price_b2c_kc",
  "weight_g" = EXCLUDED."weight_g", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

-- Kontrola: SELECT p.slug, v.sku, v.price_b2c_kc, p.allergens FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.slug = 'ochutnavkovy-set-sirupu';
COMMIT;

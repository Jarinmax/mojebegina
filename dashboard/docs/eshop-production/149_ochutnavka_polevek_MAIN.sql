-- 149: Ochutnávka polévek 3 × 450 ml za 299 Kč (Lucie 24. 11. 2026).
-- Nový produkt v kategorii Polévky. Zákazník vybírá tři různé polévky (výběr řeší web).
-- Spouštět v Neon → SQL Editor → větev main → Run. Jde spustit znovu (nic nezdvojí).
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

INSERT INTO products (category_id, slug, name, short_description, description, highlights, ingredients, allergens, allergen_note,
                      storage_instructions, shelf_life_note, is_age_restricted, warnings, sort_order, is_active)
SELECT c.id,
       'ochutnavka-polevek-3x450',
       'Ochutnávka polévek 3 × 450 ml',
       'Vyberte si tři různé polévky. Z každého sáčku připravíte dvě menší porce po 225 ml.',
       ARRAY['Tři polévky podle Vašeho výběru, každá v sáčku se šroubovacím uzávěrem (450 ml). Polévku stačí ohřát.'],
       ARRAY['tři různé polévky podle Vašeho výběru', 'z čisté filtrované vody'],
       'Podle zvolených polévek. Složení každé polévky najdete na její stránce a na etiketě sáčku.',
       ARRAY[]::text[],
       NULL,
       'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.',
       'Spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 2 dnů.',
       false,
       ARRAY[]::text[],
       5,
       true
FROM product_categories c
WHERE c.slug = 'polevky'
  AND NOT EXISTS (SELECT 1 FROM products WHERE slug = 'ochutnavka-polevek-3x450');

INSERT INTO product_variants (product_id, sku, label, short_note, volume_ml, servings, price_b2c_kc, weight_g, is_active, sort_order, sold_out)
SELECT p.id, 'polevky-3x450', NULL, '3 sáčky po 450 ml', 1350, 6, 299, 1500, true, 10, false
FROM products p
WHERE p.slug = 'ochutnavka-polevek-3x450'
  AND NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'polevky-3x450');

SELECT p.name, v.sku, v.price_b2c_kc, v.weight_g
FROM products p JOIN product_variants v ON v.product_id = p.id
WHERE p.slug = 'ochutnavka-polevek-3x450';

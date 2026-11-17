-- 127: Ochutnávkový set sirupů 5 × 100 ml (zadání Lucie 17. 11. 2026).
-- Přidá jeden produkt do kategorie Sirupy a jeho dvě balení:
--   set-sirupy-5x100-k = úvodní cena 189 Kč vč. dopravy (prvních 100 setů),
--   set-sirupy-5x100   = běžná cena 249 Kč + doprava.
-- Hmotnost 710 g = zabalený set, zvážil Jarin 17. 11. 2026. Na webu se produkt neukáže,
-- dokud ho e-shop nezapne (SET_LAUNCHED). Nic existujícího se nemění.
-- Dá se spustit opakovaně.
BEGIN;
DO $$
DECLARE cat uuid; pid uuid;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
  SELECT id INTO cat FROM product_categories WHERE slug = 'sirupy';
  IF cat IS NULL THEN RAISE EXCEPTION 'Kategorie sirupy nenalezena.'; END IF;
  INSERT INTO products (category_id, slug, name, short_description, description, highlights, ingredients, allergens,
                        storage_instructions, shelf_life_note, sort_order, is_active)
  VALUES (cat, 'ochutnavkovy-set-sirupu', 'Ochutnávkový set sirupů 5 × 100 ml',
          'Nevíte, který sirup si vybrat? Ochutnejte pět podle sebe. Každý je v samostatném sáčku se šroubovacím uzávěrem, se složením na etiketě.',
          ARRAY['Řeďte 1 : 10 – se studenou vodou jako limonádu, s horkou jako čaj.'],
          ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv'],
          'Podle zvolených sirupů. Složení každého sirupu najdete na jeho stránce a na etiketě sáčku',
          ARRAY[]::text[],
          'Skladujte v suchu a temnu do 20 °C, po otevření v lednici.',
          'Minimální trvanlivost do data uvedeného na obalu.',
          5, true)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO pid FROM products WHERE slug = 'ochutnavkovy-set-sirupu';
  INSERT INTO product_variants (product_id, sku, label, short_note, volume_ml, servings, price_b2c_kc, weight_g, sort_order, is_active)
  VALUES (pid, 'set-sirupy-5x100-k', NULL, 'Úvodní cena včetně dopravy Zásilkovnou', 500, 25, 189, 710, 10, true),
         (pid, 'set-sirupy-5x100',   NULL, '5 sáčků po 100 ml',                       500, 25, 249, 710, 20, true)
  ON CONFLICT (sku) DO NOTHING;
END $$;
COMMIT;
SELECT p.slug, p.sort_order, v.sku, v.price_b2c_kc, v.weight_g FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.slug = 'ochutnavkovy-set-sirupu' ORDER BY v.sort_order;

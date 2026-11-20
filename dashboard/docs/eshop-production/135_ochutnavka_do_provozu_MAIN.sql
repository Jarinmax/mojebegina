-- 135: Ochutnávka do provozu – jen pro kavárny a bistra (zadání Lucie 20. 11. 2026).
-- Přidá skrytou kategorii „ochutnavka-provoz“, jeden produkt a 14 balení po 49 Kč:
--   6 polévek po 200 ml (250 g), 7 sirupů po 100 ml (140 g) a Svařák Deluxe 200 ml (250 g, 18+).
-- Na webu se nikde neukáže (kategorie i produkt jsou v kódu skryté); objednávka jde
-- jen přes stránku Pro kavárny a bistra a jen po spuštění v kódu (CAFE_TASTING_LAUNCHED).
-- SPOUŠTĚT AŽ PO ZVEŘEJNĚNÍ KÓDU (starší verze webu by kategorii ukázala).
-- Nic existujícího se nemění. Dá se spustit opakovaně.
BEGIN;
DO $$
DECLARE cat uuid; pid uuid;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
  INSERT INTO product_categories (slug, name, intro, sort_order, is_active)
  VALUES ('ochutnavka-provoz', 'Ochutnávka do provozu', ARRAY[]::text[], 90, true)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO cat FROM product_categories WHERE slug = 'ochutnavka-provoz';
  INSERT INTO products (category_id, slug, name, short_description, description, highlights, ingredients, allergens,
                        storage_instructions, shelf_life_note, sort_order, is_active)
  VALUES (cat, 'ochutnavka-do-provozu', 'Ochutnávka do provozu',
          'Ochutnávka polévek a sirupů pro kavárny a bistra. Z každé položky nejvýš 1 kus.',
          ARRAY['Polévky 200 ml ve stříbrném sáčku se šroubovacím uzávěrem, sirupy 100 ml v sáčku se šroubovacím uzávěrem.'],
          ARRAY[]::text[],
          'Podle zvolených položek. Složení najdete na stránce každého produktu a na etiketě sáčku',
          ARRAY[]::text[],
          'Polévky skladujte v chladničce do 4 °C. Sirupy skladujte v suchu a temnu do 20 °C, po otevření v lednici.',
          'Spotřebujte do data uvedeného na obalu.',
          900, true)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO pid FROM products WHERE slug = 'ochutnavka-do-provozu';
  INSERT INTO product_variants (product_id, sku, label, short_note, volume_ml, servings, price_b2c_kc, weight_g, sort_order, is_active)
  VALUES (pid, 'ochutnavka-polevka-dynova-polevka',                    'Dýňová polévka 200 ml',                     'Polévka 200 ml', 200, NULL, 49, 250, 10, true),
         (pid, 'ochutnavka-polevka-kulajda',                           'Kulajda 200 ml',                            'Polévka 200 ml', 200, NULL, 49, 250, 20, true),
         (pid, 'ochutnavka-polevka-rajcatova-polevka',                 'Tomatová polévka 200 ml',                   'Polévka 200 ml', 200, NULL, 49, 250, 30, true),
         (pid, 'ochutnavka-polevka-rajcatova-polevka-s-cervenou-repou','Rajčatová polévka s červenou řepou 200 ml', 'Polévka 200 ml', 200, NULL, 49, 250, 40, true),
         (pid, 'ochutnavka-polevka-gulasova-polevka-z-hlivy-ustricne', 'Gulášová polévka z hlívy ústřičné 200 ml',  'Polévka 200 ml', 200, NULL, 49, 250, 50, true),
         (pid, 'ochutnavka-polevka-spenatova-polevka',                 'Špenátová polévka 200 ml',                  'Polévka 200 ml', 200, NULL, 49, 250, 60, true),
         (pid, 'ochutnavka-sirup-bylinny-sirup-saman',                 'Bylinný sirup Šaman 100 ml',                'Sirup 100 ml',   100, NULL, 49, 140, 110, true),
         (pid, 'ochutnavka-sirup-lipovy-sirup',                        'Lipový sirup 100 ml',                       'Sirup 100 ml',   100, NULL, 49, 140, 120, true),
         (pid, 'ochutnavka-sirup-zazvorovy-sirup',                     'Zázvorový sirup 100 ml',                    'Sirup 100 ml',   100, NULL, 49, 140, 130, true),
         (pid, 'ochutnavka-sirup-ibiskovy-sirup',                      'Ibiškový sirup 100 ml',                     'Sirup 100 ml',   100, NULL, 49, 140, 140, true),
         (pid, 'ochutnavka-sirup-sipkovy-sirup',                       'Šípkový sirup 100 ml',                      'Sirup 100 ml',   100, NULL, 49, 140, 150, true),
         (pid, 'ochutnavka-sirup-hermankovy-sirup',                    'Heřmánkový sirup 100 ml',                   'Sirup 100 ml',   100, NULL, 49, 140, 160, true),
         (pid, 'ochutnavka-sirup-medunkovy-sirup-s-levanduli',         'Meduňkový sirup s levandulí 100 ml',        'Sirup 100 ml',   100, NULL, 49, 140, 170, true),
         (pid, 'ochutnavka-svarak-svarak-deluxe',                      'Svařák Deluxe 200 ml',                      'Svařák 200 ml (18+)', 200, NULL, 49, 250, 210, true)
  ON CONFLICT (sku) DO NOTHING;
END $$;
COMMIT;
SELECT v.sku, v.label, v.price_b2c_kc, v.weight_g FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.slug = 'ochutnavka-do-provozu' ORDER BY v.sort_order;

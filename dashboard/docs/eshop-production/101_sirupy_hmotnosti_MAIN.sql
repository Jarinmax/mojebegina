-- Sirupy (12. 11. 2026): skutečná hmotnost balení pro výpočet dopravy.
-- Sirup je těžší než voda (zváženo ve výrobě, sdělení Lucie 12. 11. 2026):
--   3 l sirupu   = 3 680 g (dosud 3 000 g),
--   650 ml sáček =   780 g (dosud   750 g).
-- Mění se JEN weight_g u 14 balení sirupů → e-shop podle toho sám počítá
-- pásmo chlazené přepravy. Ceny, názvy, SKU, objemy, ostatní produkty
-- (polévky, čaje, nápoje: 3 l ≈ 3 kg) ani staré objednávky se NEMĚNÍ.
-- Vrácení: UPDATE … SET weight_g = 3000 / 750 se stejnými podmínkami.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main, jen jednou.
BEGIN;

DO $$
DECLARE
  n_big int;
  n_small int;
  rest_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  SELECT md5(string_agg(concat_ws('|', v.sku, v.label, v.volume_ml::text, v.servings::text, v.price_b2c_kc::text,
           v.is_active::text, CASE WHEN c.slug = 'sirupy' THEN '' ELSE v.weight_g::text END), '#' ORDER BY v.sku))
    INTO rest_before
    FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id;

  UPDATE product_variants v SET weight_g = 3680, updated_at = now()
    FROM products p JOIN product_categories c ON c.id = p.category_id
   WHERE p.id = v.product_id AND c.slug = 'sirupy' AND v.volume_ml = 3000 AND v.weight_g = 3000;
  GET DIAGNOSTICS n_big = ROW_COUNT;

  UPDATE product_variants v SET weight_g = 780, updated_at = now()
    FROM products p JOIN product_categories c ON c.id = p.category_id
   WHERE p.id = v.product_id AND c.slug = 'sirupy' AND v.volume_ml = 650 AND v.weight_g = 750;
  GET DIAGNOSTICS n_small = ROW_COUNT;

  IF n_big <> 7 OR n_small <> 7 THEN
    RAISE EXCEPTION 'Čekal jsem 7 balení 3 l (3 000 g) a 7 balení 650 ml (750 g), našel jsem % a % — zastavuji, nic se nezměnilo.', n_big, n_small;
  END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', v.sku, v.label, v.volume_ml::text, v.servings::text, v.price_b2c_kc::text,
           v.is_active::text, CASE WHEN c.slug = 'sirupy' THEN '' ELSE v.weight_g::text END), '#' ORDER BY v.sku))
      FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id) THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než hmotnost sirupů — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: sirupy 3 l = 3 680 g, 650 ml = 780 g (14 balení). Ostatní beze změny.';
END $$;

COMMIT;

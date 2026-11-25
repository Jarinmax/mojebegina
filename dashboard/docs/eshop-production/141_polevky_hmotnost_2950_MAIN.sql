-- Polévky 3 l (21. 11. 2026, Jarin a Lucie): hmotnost pro výpočet dopravy 2 950 g.
-- Mění se JEN weight_g u 6 polévek 3 l (3 000 → 2 950). Ceny polévek, názvy,
-- SKU, sirupy, čaje, nápoje ani staré objednávky se NEMĚNÍ.
-- Dopad: 5 begin polévky = 14,75 kg → chlazená doprava 267 Kč (dřív 15 kg = 379 Kč).
-- Vrácení: UPDATE … SET weight_g = 3000 se stejnými podmínkami.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main, jen jednou.
BEGIN;

DO $$
DECLARE
  n_soups int;
  rest_before text;
  rest_sql constant text := $q$
    SELECT md5(string_agg(concat_ws('|', v.sku, v.label, v.volume_ml::text, v.servings::text, v.price_b2c_kc::text,
             v.is_active::text, CASE WHEN c.slug = 'polevky' AND v.volume_ml = 3000 THEN '' ELSE v.weight_g::text END), '#' ORDER BY v.sku))
      FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id $q$;
  rest_after text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_before;

  UPDATE product_variants v SET weight_g = 2950, updated_at = now()
    FROM products p JOIN product_categories c ON c.id = p.category_id
   WHERE p.id = v.product_id AND c.slug = 'polevky' AND v.volume_ml = 3000 AND v.weight_g = 3000;
  GET DIAGNOSTICS n_soups = ROW_COUNT;

  IF n_soups <> 6 THEN
    RAISE EXCEPTION 'Čekal jsem 6 polévek 3 l s hmotností 3000 g, našel jsem % — zastavuji, nic se nezměnilo.', n_soups;
  END IF;

  EXECUTE rest_sql INTO rest_after;
  IF rest_before IS DISTINCT FROM rest_after THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než hmotnost polévek 3 l — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: polévky 3 l = 2950 g (6 balení). Ostatní beze změny.';
END $$;

COMMIT;

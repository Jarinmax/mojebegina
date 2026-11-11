-- Sirupy (11. 11. 2026): malé balení ve stříbrném sáčku 700 ml → 650 ml.
-- U všech 7 sirupů: štítek „650 ml“, „Až 32 nápojů“ (650 ml : 20 ml),
-- popis balení „650 ml – …“, volume_ml 650, servings 32.
-- SKU (…-750ml), cena 199 Kč, hmotnost pro dopravu, balení 3 l, ostatní
-- produkty i staré objednávky se NEMĚNÍ.
--
-- SPUSTIT až po nasazení kódu, CELÝ v Neon SQL Editoru na větvi main, jen jednou.
-- Vrácení: stejný UPDATE s hodnotami 700 ml / Až 35 nápojů / 700 / 35.
BEGIN;

DO $$
DECLARE
  n int;
  rest_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  SELECT md5(string_agg(concat_ws('|', v.sku, v.label, v.short_note, v.package_description, v.volume_ml::text,
           v.servings::text, v.price_b2c_kc::text, v.weight_g::text, v.is_active::text), '#' ORDER BY v.sku))
    INTO rest_before FROM product_variants v WHERE v.label IS DISTINCT FROM '700 ml';

  UPDATE product_variants v
     SET label = '650 ml',
         short_note = 'Až 32 nápojů',
         package_description = '650 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.',
         volume_ml = 650,
         servings = 32,
         updated_at = now()
    FROM products p JOIN product_categories c ON c.id = p.category_id
   WHERE p.id = v.product_id AND c.slug = 'sirupy'
     AND v.label = '700 ml' AND v.volume_ml = 700 AND v.sku LIKE '%-750ml';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN
    RAISE EXCEPTION 'Čekal jsem 7 sirupů s balením 700 ml, změnil bych % — zastavuji, nic se nezměnilo.', n;
  END IF;

  IF EXISTS (SELECT 1 FROM product_variants WHERE label = '700 ml' OR volume_ml = 700) THEN
    RAISE EXCEPTION 'Zbylo jiné balení 700 ml — zastavuji, nic se nezměnilo.';
  END IF;
  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', v.sku, v.label, v.short_note, v.package_description, v.volume_ml::text,
           v.servings::text, v.price_b2c_kc::text, v.weight_g::text, v.is_active::text), '#' ORDER BY v.sku))
      FROM product_variants v WHERE v.label IS DISTINCT FROM '650 ml') THEN
    RAISE EXCEPTION 'Změnilo by se jiné balení — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: 7 sirupů má malé balení 650 ml (Až 32 nápojů), cena a SKU beze změny.';
END $$;

COMMIT;

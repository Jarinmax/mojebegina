-- Sirupy 650 ml (13. 11. 2026): hmotnost kapsičky pro výpočet dopravy.
-- Upřesnění Lucie 13. 11. 2026: 780 g (skript 101) byla jen hmotnost sirupu;
-- sirup i s kapsičkou váží 805 g. Mění se JEN weight_g u 7 kapsiček 650 ml
-- (780 → 805). Sirupy 3 l (3 826 g), ceny, názvy, SKU, ostatní produkty ani
-- staré objednávky se NEMĚNÍ. Chlazená přeprava vyjde stejně (i 18 kapsiček
-- = 14,49 kg zůstává v prvním pásmu do 15 kg).
-- Vrácení: UPDATE … SET weight_g = 780 se stejnými podmínkami.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main, jen jednou.
BEGIN;

DO $$
DECLARE
  n_small int;
  rest_before text;
  rest_sql constant text := $q$
    SELECT md5(string_agg(concat_ws('|', v.sku, v.label, v.volume_ml::text, v.servings::text, v.price_b2c_kc::text,
             v.is_active::text, CASE WHEN c.slug = 'sirupy' AND v.volume_ml = 650 THEN '' ELSE v.weight_g::text END), '#' ORDER BY v.sku))
      FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id $q$;
  rest_after text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_before;

  UPDATE product_variants v SET weight_g = 805, updated_at = now()
    FROM products p JOIN product_categories c ON c.id = p.category_id
   WHERE p.id = v.product_id AND c.slug = 'sirupy' AND v.volume_ml = 650 AND v.weight_g = 780;
  GET DIAGNOSTICS n_small = ROW_COUNT;

  IF n_small <> 7 THEN
    RAISE EXCEPTION 'Čekal jsem 7 kapsiček 650 ml s hmotností 780 g, našel jsem % — zastavuji, nic se nezměnilo.', n_small;
  END IF;

  EXECUTE rest_sql INTO rest_after;
  IF rest_before IS DISTINCT FROM rest_after THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než hmotnost kapsiček 650 ml — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: sirupy 650 ml = 805 g (7 balení). Ostatní beze změny.';
END $$;

COMMIT;

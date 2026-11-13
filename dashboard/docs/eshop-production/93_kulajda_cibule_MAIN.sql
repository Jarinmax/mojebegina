-- Kulajda: cibule 5 % (dříve 3 %) — 10. 11. 2026, podle výrobní receptury
-- Jarina v tabulce „Begina-polevky“ (Kulajda 3L: cibule 150 g; kalkulace
-- uváděla 100 g). 150 g / čistá hmotnost ≈ 2 940 g = 5,1 % → 5 %.
-- Výživa se nemění (+50 g cibule = cca +2 kJ a +0,1 g sacharidů na 100 ml,
-- v rámci zaokrouhlení). Nic jiného se NEMĚNÍ.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production).
BEGIN;

DO $$
DECLARE
  n int;
  rest_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text), '#' ORDER BY slug)) INTO rest_before
    FROM products WHERE slug <> 'kulajda';

  UPDATE products SET ingredients = replace(ingredients, 'žampiony 7 %, cibule 3 %', 'žampiony 7 %, cibule 5 %'), updated_at = now()
   WHERE slug = 'kulajda' AND ingredients = 'čistá filtrovaná voda, brambory 22 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), žampiony 7 %, cibule 3 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Kulajda nemá očekávané složení (cibule 3 %%) — zastavuji, nic se nezměnilo.'; END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text), '#' ORDER BY slug))
    FROM products WHERE slug <> 'kulajda') THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: Kulajda má cibuli 5 %%.';
END $$;

COMMIT;

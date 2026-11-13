-- Opravy 10. 11. 2026 odpoledne (po skriptu 88):
--   Gulášová z hlívy: sůl 0,82 g/100 ml (dříve 0,86) — potvrzeno 23 g
--   mořské soli, konečný objem 3 l, čistá hmotnost 2 963 g;
--   Špenátová: cibule 4 % (dříve 4,3 %); Kulajda: cibule 3 % (dříve 3,4 %).
-- Nic jiného se NEMĚNÍ. SPUSTIT CELÝ v Neon SQL Editoru na větvi main.
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
    FROM products WHERE slug NOT IN ('gulasova-polevka-z-hlivy-ustricne', 'spenatova-polevka', 'kulajda');

  UPDATE products SET nutrition = jsonb_set(nutrition, '{salt}', '0.82'::jsonb), updated_at = now()
   WHERE slug = 'gulasova-polevka-z-hlivy-ustricne' AND (nutrition->>'salt')::numeric = 0.86 AND (nutrition->>'energy_kj')::int = 125;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Gulášová nemá sůl 0,86 (nebo nemá výživu ze skriptu 88) — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = replace(ingredients, 'cibule 4,3 %', 'cibule 4 %'), updated_at = now()
   WHERE slug = 'spenatova-polevka' AND ingredients = 'čistá filtrovaná voda, špenát 17 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 14 %, cibule 4,3 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Špenátová nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = replace(ingredients, 'cibule 3,4 %', 'cibule 3 %'), updated_at = now()
   WHERE slug = 'kulajda' AND ingredients = 'čistá filtrovaná voda, brambory 22 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), žampiony 7 %, cibule 3,4 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Kulajda nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text), '#' ORDER BY slug))
    FROM products WHERE slug NOT IN ('gulasova-polevka-z-hlivy-ustricne', 'spenatova-polevka', 'kulajda')) THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: Gulášová sůl 0,82 g; Špenátová cibule 4 %%, Kulajda cibule 3 %%.';
END $$;

COMMIT;

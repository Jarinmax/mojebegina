-- Špenátová polévka (10. 11. 2026): nové složení a výživové údaje na 100 ml.
--   Složení: kokosové mléko 14 % (dříve 15 %), brambory 14 % (dříve 13 %),
--   cibule bez procenta (dříve 4 %); ostatní beze změny. Závorka u kokosového
--   mléka kulatá jako u ostatních polévek (podklad měl hranatou).
--   Výživa: 199 kJ / 48 kcal, tuky 3,4 g (nasycené 2,4 g), sacharidy 2,7 g
--   (cukry 0,7 g), bílkoviny 1,1 g, sůl 0,76 g. Vláknina v podkladu není →
--   na webu se už neuvádí.
-- INTERNÍ POZNÁMKA (nezobrazuje se zákazníkům): výpočtové průměrné hodnoty
--   podle receptury na 3 l ze souboru Polevky_kalkulace(2).xlsx; u olejů
--   průměrné hodnoty. Viz docs/eshop-production/VYZIVOVE_UDAJE_ZDROJE.md.
-- Ostatní polévky, ceny, texty ani nic jiného se NEMĚNÍ.
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  n int;
  rest_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, nutrition_basis, name, description::text, highlights::text), '#' ORDER BY slug))
    INTO rest_before FROM products WHERE slug <> 'spenatova-polevka';

  UPDATE products
     SET ingredients = 'čistá filtrovaná voda, špenát 17 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 14 %, cibule, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C)',
         nutrition = '{"energy_kj": 199, "energy_kcal": 48, "fat": 3.4, "saturates": 2.4, "carbohydrate": 2.7, "sugars": 0.7, "protein": 1.1, "salt": 0.76}'::jsonb,
         nutrition_basis = '100ml',
         updated_at = now()
   WHERE slug = 'spenatova-polevka'
     AND ingredients = 'čistá filtrovaná voda, špenát 17 %, kokosové mléko 15 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 13 %, cibule 4 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C)'
     AND (nutrition->>'energy_kj')::int = 210;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Špenátová polévka nemá očekávané původní složení a výživu (změnil bych %) — zastavuji, nic se nezměnilo.', n; END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, nutrition_basis, name, description::text, highlights::text), '#' ORDER BY slug))
    FROM products WHERE slug <> 'spenatova-polevka') THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: Špenátová polévka má nové složení a výživové údaje.';
END $$;

COMMIT;

-- Kulajda, Špenátová a Tomatová polévka (10. 11. 2026): nové složení
-- a výživové údaje na 100 ml (výpočtové průměrné hodnoty). Rajčatová polévka
-- s červenou řepou, ostatní polévky, skladování, trvanlivost, ceny ani texty
-- se NEMĚNÍ. Vláknina (původní neověřený údaj) se u těchto tří už neuvádí.
-- Na webu se výživa těchto tří zobrazí jako tabulka (kód, ne DB).
--
-- INTERNÍ POZNÁMKA (nezobrazuje se zákazníkům): výpočet podle receptur na 3 l
-- ze souboru Polevky_kalkulace(2).xlsx; čistá hmotnost Kulajda 2 915 g,
-- Tomatová 3 015 g (kokosové mléko 200 ml = 181 g podle vážení); u olejů
-- průměrné hodnoty. Viz docs/eshop-production/VYZIVOVE_UDAJE_ZDROJE.md.
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
  SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, storage_instructions, shelf_life_note, description::text), '#' ORDER BY slug))
    INTO rest_before FROM products WHERE slug NOT IN ('kulajda', 'spenatova-polevka', 'rajcatova-polevka');

  UPDATE products
     SET ingredients = 'čistá filtrovaná voda, brambory 22 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), žampiony 7 %, cibule 3,4 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, antioxidant: kyselina askorbová (vitamin C)',
         nutrition = '{"energy_kj": 219, "energy_kcal": 53, "fat": 3.5, "saturates": 2.4, "carbohydrate": 3.9, "sugars": 0.8, "protein": 1.0, "salt": 0.76}'::jsonb,
         nutrition_basis = '100ml',
         updated_at = now()
   WHERE slug = 'kulajda'
     AND ingredients = 'čistá filtrovaná voda, brambory 20 %, kokosové mléko 15 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), žampiony 7 %, cibule 3 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, antioxidant: kyselina askorbová (vitamin C)'
     AND (nutrition->>'energy_kj')::int = 187;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'kulajda: nemá očekávané původní složení a výživu — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products
     SET ingredients = 'čistá filtrovaná voda, špenát 17 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 14 %, cibule 4,3 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C)',
         nutrition = '{"energy_kj": 199, "energy_kcal": 48, "fat": 3.4, "saturates": 2.4, "carbohydrate": 2.7, "sugars": 0.7, "protein": 1.1, "salt": 0.76}'::jsonb,
         nutrition_basis = '100ml',
         updated_at = now()
   WHERE slug = 'spenatova-polevka'
     AND ingredients = 'čistá filtrovaná voda, špenát 17 %, kokosové mléko 15 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 13 %, cibule 4 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C)'
     AND (nutrition->>'energy_kj')::int = 210;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'spenatova-polevka: nemá očekávané původní složení a výživu — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products
     SET ingredients = 'čistá filtrovaná voda, pasírovaná rajčata 27 % (rajčata 99,9 %, regulátor kyselosti: kyselina citronová), rajčatový protlak 7 % (rajčatový protlak, jedlá sůl 1 %), brambory 7 %, kokosové mléko 6 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), cibule 5 %, kořen petržele, olivový olej, třtinový cukr, mořská sůl, česnek, libeček, černý pepř, kardamom, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma',
         nutrition = '{"energy_kj": 229, "energy_kcal": 54, "fat": 2.9, "saturates": 1.3, "carbohydrate": 5.5, "sugars": 4.4, "protein": 1.2, "salt": 0.86}'::jsonb,
         nutrition_basis = '100ml',
         updated_at = now()
   WHERE slug = 'rajcatova-polevka'
     AND ingredients = 'čistá filtrovaná voda, pasírovaná rajčata 27 %, rajčatový protlak 7 %, brambory 7 %, kokosové mléko 7 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), cibule 5 %, petržel kořen, olivový olej, třtinový cukr, mořská sůl, česnek, libeček, pepř černý, kardamom, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma'
     AND (nutrition->>'energy_kj')::int = 255;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'rajcatova-polevka: nemá očekávané původní složení a výživu — zastavuji, nic se nezměnilo.'; END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, storage_instructions, shelf_life_note, description::text), '#' ORDER BY slug))
    FROM products WHERE slug NOT IN ('kulajda', 'spenatova-polevka', 'rajcatova-polevka')) THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: Kulajda, Špenátová a Tomatová mají nové složení a výživové údaje.';
END $$;

COMMIT;

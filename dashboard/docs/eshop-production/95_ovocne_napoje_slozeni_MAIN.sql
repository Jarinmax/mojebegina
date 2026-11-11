-- Ovocné nápoje: složení s procenty, výživa, skladování a trvanlivost
-- (11. 11. 2026). Receptury: tabulka „Ovocne napoje_kalkulace“; výživa ze štítků
-- šťáv (Sadvit jablko-malina 85/15; Naturalne Tłoczone grep, jablko, citron;
-- pomeranč tabulkově). Trvanlivost (Jaroslav): neotevřené 14 dnů od výroby
-- v lednici, po otevření 5 dnů. Mění jen 3 ovocné nápoje, nic jiného.
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
  SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, storage_instructions, shelf_life_note), '#' ORDER BY slug)) INTO rest_before
    FROM products WHERE slug NOT IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko');

  UPDATE products SET ingredients = 'čistá filtrovaná voda, jablečno-malinová šťáva 34 % (jablečná šťáva 85 %, malinová šťáva 15 %), citronová šťáva 1 %, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', nutrition = '{"energy_kj": 69, "energy_kcal": 16, "fat": 0, "saturates": 0, "carbohydrate": 3.9, "sugars": 3.6, "protein": 0.1, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření. Před použitím protřepejte, usazenina z ovoce je přirozená. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena – vadu zjištěnou při převzetí nám prosím ohlaste ihned, ideálně s fotografií.', shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu (14 dnů od výroby). Po otevření spotřebujte do 5 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'cervankove-nebe' AND ingredients = 'čistá filtrovaná voda, jablečno-malinová šťáva, citronová šťáva, antioxidant: kyselina askorbová (vitamin C), přírodní aroma';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'cervankove-nebe: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'čistá filtrovaná voda, grepová šťáva 14 %, jablečná šťáva 14 %, citronová šťáva 4 %, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', nutrition = '{"energy_kj": 52, "energy_kcal": 12, "fat": 0, "saturates": 0, "carbohydrate": 2.8, "sugars": 2.7, "protein": 0.1, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření. Před použitím protřepejte, usazenina z ovoce je přirozená. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena – vadu zjištěnou při převzetí nám prosím ohlaste ihned, ideálně s fotografií.', shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu (14 dnů od výroby). Po otevření spotřebujte do 5 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'dum-u-jezera' AND ingredients = 'čistá filtrovaná voda, grepová šťáva, jablečná šťáva, citronová šťáva, antioxidant: kyselina askorbová (vitamin C), přírodní aroma';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'dum-u-jezera: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'jablečno-malinová šťáva 51 % (jablečná šťáva 85 %, malinová šťáva 15 %), čistá filtrovaná voda, pomerančová šťáva 7 %, hřebíček, skořice, badyán, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 115, "energy_kcal": 27, "fat": 0, "saturates": 0, "carbohydrate": 6.5, "sugars": 6, "protein": 0.2, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření. Před použitím protřepejte, usazenina z ovoce je přirozená. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena – vadu zjištěnou při převzetí nám prosím ohlaste ihned, ideálně s fotografií.', shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu (14 dnů od výroby). Po otevření spotřebujte do 5 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'malinovy-svarak-nealko' AND ingredients = 'čistá filtrovaná voda, jablečná šťáva, malinová šťáva, pomerančová šťáva, hřebíček, skořice, badyán, antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'malinovy-svarak-nealko: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, storage_instructions, shelf_life_note), '#' ORDER BY slug))
    FROM products WHERE slug NOT IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko')) THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: ovocné nápoje mají nové složení, výživu a trvanlivost.';
END $$;

COMMIT;

-- Čaje: složení s procenty (bez kyseliny citronové — nepřidává se), výživa,
-- skladování a trvanlivost: po otevření 14 dnů (Jarin) (11. 11. 2026).
-- Ženšen v Šamanovi (čaj i sirup) = ženšen sibiřský (Eleutherococcus senticosus).
-- Mění jen 8 čajů a sirup Šaman. SPUSTIT CELÝ v Neon SQL Editoru na větvi main.
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
    FROM products WHERE slug NOT IN ('bylinny-caj-saman', 'zazvorovy-caj', 'lipovy-caj', 'hermankovy-caj', 'cerny-caj-golden-nepal', 'jasminovy-zeleny-caj', 'ibiskovy-caj', 'medunkovy-caj-s-levanduli', 'bylinny-sirup-saman');

  UPDATE products SET ingredients = 'bylinný výluh 93 % (čistá filtrovaná voda, šípek (Rosa canina), čaga (Inonotus obliquus), ženšen sibiřský (Eleutherococcus senticosus), zázvor (Zingiber officinale)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 95, "energy_kcal": 22, "fat": 0, "saturates": 0, "carbohydrate": 5.6, "sugars": 5.6, "protein": 0, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', shelf_life_days = 14, shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'bylinny-caj-saman' AND ingredients = 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, šípek (Rosa canina), čaga (Inonotus obliquus), ženšen pravý (Panax ginseng), zázvor (Zingiber officinale), antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'bylinny-caj-saman: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'bylinný výluh 93 % (čistá filtrovaná voda, zázvor (Zingiber officinale)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 95, "energy_kcal": 22, "fat": 0, "saturates": 0, "carbohydrate": 5.6, "sugars": 5.6, "protein": 0, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', shelf_life_days = 14, shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'zazvorovy-caj' AND ingredients = 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, zázvor (Zingiber officinale), antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'zazvorovy-caj: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'bylinný výluh 93 % (čistá filtrovaná voda, lipový květ (Tiliae flos)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 95, "energy_kcal": 22, "fat": 0, "saturates": 0, "carbohydrate": 5.6, "sugars": 5.6, "protein": 0, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', shelf_life_days = 14, shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'lipovy-caj' AND ingredients = 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, lipový květ (Tiliae flos), antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'lipovy-caj: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'bylinný výluh 92 % (čistá filtrovaná voda, květ heřmánku (Matricaria chamomilla)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 95, "energy_kcal": 22, "fat": 0, "saturates": 0, "carbohydrate": 5.6, "sugars": 5.6, "protein": 0, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', shelf_life_days = 14, shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'hermankovy-caj' AND ingredients = 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, květ heřmánku (Matricaria chamomilla), antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'hermankovy-caj: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'čajový výluh 93 % (čistá filtrovaná voda, černý čaj Golden Nepal (Camellia assamica)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 95, "energy_kcal": 22, "fat": 0, "saturates": 0, "carbohydrate": 5.6, "sugars": 5.6, "protein": 0, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', shelf_life_days = 14, shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'cerny-caj-golden-nepal' AND ingredients = 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, černý čaj Golden Nepal (Camellia assamica), antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'cerny-caj-golden-nepal: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'čajový výluh 93 % (čistá filtrovaná voda, zelený čaj Sencha (Camellia sinensis), květ jasmínu (Jasminum officinale)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 95, "energy_kcal": 22, "fat": 0, "saturates": 0, "carbohydrate": 5.6, "sugars": 5.6, "protein": 0, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', shelf_life_days = 14, shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'jasminovy-zeleny-caj' AND ingredients = 'čistá filtrovaná voda, třtinový cukr, citrónová šťáva, zelený čaj Sencha (Camellia sinensis), květ jasmínu (Jasminum officinale), antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'jasminovy-zeleny-caj: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'bylinný výluh 92 % (čistá filtrovaná voda, květ ibišku (Hibiscus sabdariffa)), třtinový cukr, citronová šťáva 3 %, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 95, "energy_kcal": 22, "fat": 0, "saturates": 0, "carbohydrate": 5.6, "sugars": 5.6, "protein": 0, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', shelf_life_days = 14, shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'ibiskovy-caj' AND ingredients = 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, ibišek (Hibiscus), antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'ibiskovy-caj: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'bylinný výluh 92 % (čistá filtrovaná voda, meduňka (Melissa officinalis), květ levandule (Lavandula angustifolia)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 95, "energy_kcal": 22, "fat": 0, "saturates": 0, "carbohydrate": 5.6, "sugars": 5.6, "protein": 0, "salt": 0}'::jsonb,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', shelf_life_days = 14, shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'medunkovy-caj-s-levanduli' AND ingredients = 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, meduňka (Melissa officinalis), květ levandule (Lavandula angustifolia), antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'medunkovy-caj-s-levanduli: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = replace(ingredients, 'ženšen pravý (Panax ginseng)', 'ženšen sibiřský (Eleutherococcus senticosus)'), updated_at = now()
   WHERE slug = 'bylinny-sirup-saman' AND ingredients LIKE '%ženšen pravý (Panax ginseng)%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'bylinny-sirup-saman: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, storage_instructions, shelf_life_note), '#' ORDER BY slug))
    FROM products WHERE slug NOT IN ('bylinny-caj-saman', 'zazvorovy-caj', 'lipovy-caj', 'hermankovy-caj', 'cerny-caj-golden-nepal', 'jasminovy-zeleny-caj', 'ibiskovy-caj', 'medunkovy-caj-s-levanduli', 'bylinny-sirup-saman')) THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: čaje mají nové složení, výživu a trvanlivost; Šaman má ženšen sibiřský.';
END $$;

COMMIT;

-- Alkoholické koktejly: složení s procenty, výživa, trvanlivost (11. 11. 2026).
-- Receptury: „Alkoholické koktejly kalkulace“ (Svařák Deluxe upraven: pomeranč
-- 400 ml, citron 100 ml, voda 200 ml). Výživa vč. energie z alkoholu; brusinka
-- a jablko/grep/citron ze štítků šťáv. Trvanlivost (Jaroslav): neotevřené
-- 3 měsíce v lednici, po otevření 14 dnů. Mění jen 4 koktejly.
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
  SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, shelf_life_note), '#' ORDER BY slug)) INTO rest_before
    FROM products WHERE slug NOT IN ('granatovy-bond', 'kosmopolitan', 'lady-carneval', 'svarak-deluxe');

  UPDATE products SET ingredients = 'čistá filtrovaná voda, šťáva z granátového jablka 16 %, vodka 15 %, třtinový cukr, citronová šťáva 6 %, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 306, "energy_kcal": 73, "fat": 0, "saturates": 0, "carbohydrate": 9.6, "sugars": 9.6, "protein": 0.1, "salt": 0}'::jsonb, nutrition_basis = '100ml',
         shelf_life_note = 'Minimální trvanlivost do data uvedeného na obalu (3 měsíce od výroby při skladování v chladničce). Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'granatovy-bond' AND ingredients = 'čistá filtrovaná voda, šťáva z granátového jablka, vodka, třtinový cukr, citronová šťáva, antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'granatovy-bond: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'čistá filtrovaná voda, brusinková šťáva 27 %, jablečná šťáva 20 %, vodka 15 %, citronová šťáva 7 %, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní grapefruitové aroma', nutrition = '{"energy_kj": 303, "energy_kcal": 72, "fat": 0, "saturates": 0, "carbohydrate": 9.2, "sugars": 9.2, "protein": 0.2, "salt": 0}'::jsonb, nutrition_basis = '100ml',
         shelf_life_note = 'Minimální trvanlivost do data uvedeného na obalu (3 měsíce od výroby při skladování v chladničce). Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'kosmopolitan' AND ingredients = 'čistá filtrovaná voda, brusinková šťáva, jablečná šťáva, vodka, citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní grapefruitové aroma';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'kosmopolitan: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'čistá filtrovaná voda, vodka 15 %, grapefruitová šťáva 13 %, Aperol 8 % (pitná voda, cukr, líh, aromata, barviva: E 110, E 124), citronová šťáva 6 %, třtinový cukr, antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 304, "energy_kcal": 72, "fat": 0, "saturates": 0, "carbohydrate": 8.1, "sugars": 8.1, "protein": 0.1, "salt": 0}'::jsonb, nutrition_basis = '100ml',
         shelf_life_note = 'Minimální trvanlivost do data uvedeného na obalu (3 měsíce od výroby při skladování v chladničce). Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'lady-carneval' AND ingredients = 'čistá filtrovaná voda, vodka, grapefruitová šťáva, Aperol (pitná voda, cukr, líh, aromata, barviva: E 110, E 124), citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'lady-carneval: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products SET ingredients = 'červené víno 63 % (obsahuje SIŘIČITANY), pomerančová šťáva 13 %, grepová šťáva 10 %, čistá filtrovaná voda, třtinový cukr, citronová šťáva 3 %, koření (skořice, badyán, kardamom, vanilka, hřebíček, zázvor), antioxidant: kyselina askorbová (vitamin C)', nutrition = '{"energy_kj": 318, "energy_kcal": 76, "fat": 0, "saturates": 0, "carbohydrate": 8.4, "sugars": 6.8, "protein": 0.2, "salt": 0}'::jsonb, nutrition_basis = '100ml',
         shelf_life_note = 'Minimální trvanlivost do data uvedeného na obalu (3 měsíce od výroby při skladování v chladničce). Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug = 'svarak-deluxe' AND ingredients = 'červené víno 63 % (obsahuje SIŘIČITANY), pomerančová šťáva 13 %, grepová šťáva 10 %, citronová šťáva 7 %, třtinový cukr, výluh koření (voda, skořice, badyán, kardamom, vanilka, hřebíček, zázvor), antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'svarak-deluxe: nemá očekávané složení — zastavuji, nic se nezměnilo.'; END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, shelf_life_note), '#' ORDER BY slug))
    FROM products WHERE slug NOT IN ('granatovy-bond', 'kosmopolitan', 'lady-carneval', 'svarak-deluxe')) THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: koktejly mají nové složení, výživu a trvanlivost.';
END $$;

COMMIT;

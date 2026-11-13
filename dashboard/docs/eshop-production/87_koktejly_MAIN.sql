-- Svařák Deluxe, Lady Carneval, Granátový bond a Kosmopolitan (10. 11. 2026):
-- skladování a trvanlivost (Kosmopolitan jen to — složení a 6,3 % obj.
-- už odpovídají zadání; blokace objednání skriptem 84 zůstává); u Granátového bondu složení (šťáva před vodkou — řazení
-- podle hmotnosti) a obsah alkoholu 6,3 % obj. (dříve 6,7 %);
-- u Lady Carneval navíc složení (grapefruitová šťáva, „E 110, E 124“) a
-- odstranění upozornění „E110, E124: může nepříznivě ovlivňovat činnost
-- a pozornost dětí.“ (nepovinné u nápojů nad 1,2 % obj. — příloha V nař.
-- 1333/2008 ve znění nař. 238/2010, písm. b). Upozornění „Není určeno pro
-- děti, těhotné a kojící ženy.“ zůstává. Přípravu a vrácení řeší kód.
-- Alergeny, výživa, ceny ani jiné produkty se NEMĚNÍ; obsah alkoholu jen
-- u Granátového bondu.
--
-- INTERNÍ POZNÁMKA — alkohol Lady Carneval (nezobrazuje se): 500 ml vodky
-- 37,5 % + 250 ml Aperolu 11 % = 187,5 + 27,5 = 215 ml čistého alkoholu;
-- 215 / 3 000 ml = 7,17 % obj. → 7,2 % obj. Předpoklad: bez ztrát alkoholu
-- při výrobě.
-- INTERNÍ POZNÁMKA — alkohol Granátový bond: 500 ml vodky 37,5 % = 187,5 ml
-- čistého alkoholu; / 3 000 ml = 6,25 % obj. → 6,3 % obj. Bez ztrát.
-- Pořadí: 500 ml šťávy (hustota vodného roztoku ≥ 1,0 g/ml) váží víc než
-- 500 ml vodky 37,5 % obj. (≈ 0,95 g/ml).
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
  SELECT md5(string_agg(concat_ws('|', slug, ingredients, storage_instructions, shelf_life_note, warnings::text, alcohol_percent::text, allergens::text, nutrition::text), '#' ORDER BY slug))
    INTO rest_before FROM products WHERE slug NOT IN ('svarak-deluxe', 'lady-carneval', 'granatovy-bond', 'kosmopolitan');

  UPDATE products
     SET storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.',
         shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte co nejdříve při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.',
         updated_at = now()
   WHERE slug = 'svarak-deluxe'
     AND storage_instructions = 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.'
     AND shelf_life_note IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Svařák Deluxe nemá očekávané původní skladování/trvanlivost — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products
     SET ingredients = 'čistá filtrovaná voda, vodka, grapefruitová šťáva, Aperol (pitná voda, cukr, líh, aromata, barviva: E 110, E 124), citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C)',
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.',
         shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte co nejdříve při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.',
         warnings = ARRAY['Není určeno pro děti, těhotné a kojící ženy.'],
         updated_at = now()
   WHERE slug = 'lady-carneval'
     AND ingredients = 'čistá filtrovaná voda, vodka, grepová šťáva, Aperol (pitná voda, cukr, líh, aromata, barviva: E110, E124), citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C)'
     AND storage_instructions = 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.'
     AND shelf_life_note IS NULL
     AND warnings = ARRAY['Není určeno pro děti, těhotné a kojící ženy.', 'E110, E124: může nepříznivě ovlivňovat činnost a pozornost dětí.']
     AND alcohol_percent = 7.2;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Lady Carneval nemá očekávané původní údaje — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products
     SET ingredients = 'čistá filtrovaná voda, šťáva z granátového jablka, vodka, třtinový cukr, citronová šťáva, antioxidant: kyselina askorbová (vitamin C)',
         alcohol_percent = 6.3,
         storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.',
         shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte co nejdříve při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.',
         updated_at = now()
   WHERE slug = 'granatovy-bond'
     AND ingredients = 'čistá filtrovaná voda, vodka, šťáva z granátového jablka, třtinový cukr, citronová šťáva, antioxidant: kyselina askorbová (vitamin C)'
     AND alcohol_percent = 6.7
     AND storage_instructions = 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.'
     AND shelf_life_note IS NULL
     AND warnings = ARRAY['Není určeno pro děti, těhotné a kojící ženy.'];
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Granátový bond nemá očekávané původní údaje — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products
     SET storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.',
         shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte co nejdříve při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.',
         updated_at = now()
   WHERE slug = 'kosmopolitan'
     AND ingredients = 'čistá filtrovaná voda, brusinková šťáva, jablečná šťáva, vodka, citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní aroma'
     AND alcohol_percent = 6.3
     AND storage_instructions = 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.'
     AND shelf_life_note IS NULL
     AND warnings = ARRAY['Není určeno pro děti, těhotné a kojící ženy.'];
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Kosmopolitan nemá očekávané původní údaje — zastavuji, nic se nezměnilo.'; END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, ingredients, storage_instructions, shelf_life_note, warnings::text, alcohol_percent::text, allergens::text, nutrition::text), '#' ORDER BY slug))
    FROM products WHERE slug NOT IN ('svarak-deluxe', 'lady-carneval', 'granatovy-bond', 'kosmopolitan')) THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: Svařák Deluxe, Lady Carneval, Granátový bond a Kosmopolitan mají nové údaje.';
END $$;

COMMIT;

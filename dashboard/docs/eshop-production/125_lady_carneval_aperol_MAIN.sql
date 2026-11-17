-- 125: Lady Carneval – složení Aperolu podle etikety láhve (fotka 17. 11. 2026):
-- do závorky u Aperolu se doplňuje „jedlá sůl“. Nic jiného se nemění.
-- Schválila Lucie 17. 11. 2026. Dá se spustit opakovaně.
BEGIN;
DO $$
DECLARE n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
  UPDATE products
     SET ingredients = 'čistá filtrovaná voda, vodka 15 %, grapefruitová šťáva 13 %, Aperol 8 % (pitná voda, cukr, líh, aromata, jedlá sůl, barviva: E 110, E 124), citronová šťáva 6 %, třtinový cukr, antioxidant: kyselina askorbová (vitamin C)',
         updated_at = now()
   WHERE slug = 'lady-carneval'
     AND ingredients = 'čistá filtrovaná voda, vodka 15 %, grapefruitová šťáva 13 %, Aperol 8 % (pitná voda, cukr, líh, aromata, barviva: E 110, E 124), citronová šťáva 6 %, třtinový cukr, antioxidant: kyselina askorbová (vitamin C)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN RAISE NOTICE 'Hotovo: složení Lady Carneval doplněno o jedlou sůl.';
  ELSE RAISE NOTICE 'Nic se nezměnilo – složení už je upravené, nebo se liší od očekávaného.';
  END IF;
END $$;
COMMIT;
SELECT ingredients FROM products WHERE slug = 'lady-carneval';

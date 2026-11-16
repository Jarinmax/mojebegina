-- 124: Slevový kód SIMEK24 – 24 Kč z jedné objednávky (Kreativ gang, slíbený
-- odpočet přeplatku 23,40 Kč zaokrouhlený nahoru; schválila Lucie 16. 11. 2026).
-- Jednorázový (1 použití), platí do 28. 2. 2027.
BEGIN;
DO $$
DECLARE n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
  INSERT INTO eshop_coupons (code, discount_type, amount, expires_at, usage_limit, usage_limit_per_user, note)
  VALUES ('simek24', 'fixed_cart', 24, '2027-02-28 23:59:59+01', 1, 1,
          'Kreativ gang (Šimek) – odpočet přeplatku 23,40 Kč, zaokrouhleno na 24 Kč')
  ON CONFLICT (code) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE NOTICE 'Kód simek24 už existuje – nic se nezměnilo.';
  ELSE RAISE NOTICE 'Hotovo: kód SIMEK24 (24 Kč, 1× použití) je v e-shopu.';
  END IF;
END $$;
COMMIT;

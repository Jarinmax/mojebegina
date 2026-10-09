-- PRODUCTION main — platby krok B: povinný VS u e-shopové objednávky, S POJISTKOU
-- (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs z docs/eshop-payments/21_migration.sql).
-- Spouští se PŘED první e-shopovou objednávkou. Mění jen e-shopové objednávky (teď 0)
-- a přidá kontrolu CHECK (channel <> 'eshop' OR payment_vs IS NOT NULL) — import The Cup se netýká.
-- Jako první krok kontrola: větev main (neon.timeline_id 70a96b3677653646e65343cae8e27182), krok A hotový,
-- krok B ještě ne, žádná e-shopová objednávka. Jinak „STOP“ a NIC se nezmění.
-- Spouštět CELÉ najednou v Neon SQL Editoru. Kontrola po: docs/eshop-payments/22_after.sql
-- → 1 | 0 | 0 | ano | ano. Vrácení: docs/eshop-payments/29_rollback.sql (nic nemaže).

BEGIN;

-- ===== POJISTKA: jen Production main, jen jednou, před první e-shopovou objednávkou =====
DO $guard$
DECLARE
  timeline text := current_setting('neon.timeline_id', true);
BEGIN
  IF timeline IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'STOP: tohle NENÍ Production větev main (neon.timeline_id = %). Nic se nezměnilo.', coalesce(timeline, 'neznámý');
  END IF;
  IF to_regclass('public.payments') IS NULL OR to_regclass('public.payment_vs_seq') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_vs') THEN
    RAISE EXCEPTION 'STOP: chybí platby krok A (nejdřív 13_katalog_a_platby_A_MAIN.sql). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_eshop_requires_vs') THEN
    RAISE EXCEPTION 'STOP: krok B už běžel (pojistka orders_eshop_requires_vs existuje). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE channel = 'eshop') THEN
    RAISE EXCEPTION 'STOP: v Production už je e-shopová objednávka — nečekaný stav, nejdřív ji zkontrolovat. Nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'OK: Production main, platby krok A hotový, žádná e-shopová objednávka — zapínám povinný VS.';
END
$guard$;

-- ===== docs/eshop-payments/21_migration.sql =====
-- 1. Starší e-shopové objednávky bez VS dostanou VS z řady, v pořadí,
--    v jakém vznikly (na Preview jen testovací objednávky).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM orders WHERE channel = 'eshop' AND payment_vs IS NULL ORDER BY ordered_at, created_at, id LOOP
    UPDATE orders SET payment_vs = '7' || lpad(nextval('payment_vs_seq')::text, 7, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- 2. E-shopová objednávka bez VS už nevznikne.
ALTER TABLE orders ADD CONSTRAINT orders_eshop_requires_vs
  CHECK (channel <> 'eshop' OR payment_vs IS NOT NULL);

COMMIT;

-- 117: Měření e-shopu – nová tabulka denních anonymních počítadel (jen nová tabulka, nic existujícího se nemění).
-- Stejné DDL jako drizzle/0041_mereni_eshopu.sql. Dá se spustit opakovaně.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "eshop_funnel_daily" (
  "day" date NOT NULL,
  "step" text NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "eshop_funnel_daily_day_step_pk" PRIMARY KEY("day","step")
);
COMMIT;
SELECT count(*) AS radku_mereni FROM eshop_funnel_daily;

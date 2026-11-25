-- 158 (25. 11. 2026, Lucie): SEO – tabulka pro skutečné pozice z Google Search Console.
-- Noční cron /api/cron/seo-gsc sem ukládá: den, hledaný výraz, stránku, kliknutí, zobrazení, průměrnou pozici.
-- Jen nová tabulka, nic nemaže ani nemění.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production), jen jednou.
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS seo_gsc_daily (
  day          date         NOT NULL,
  query        text         NOT NULL,
  page         text         NOT NULL,
  clicks       integer      NOT NULL DEFAULT 0,
  impressions  integer      NOT NULL DEFAULT 0,
  position     numeric(6,1) NOT NULL DEFAULT 0,
  PRIMARY KEY (day, query, page)
);
CREATE INDEX IF NOT EXISTS seo_gsc_daily_query_idx ON seo_gsc_daily (query);

COMMIT;

SELECT to_regclass('public.seo_gsc_daily') AS tabulka_pripravena;

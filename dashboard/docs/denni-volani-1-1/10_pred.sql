-- DENNÍ VOLÁNÍ 1.1 — kontrola PŘED migrací 0026 (jen čtení).
-- Očekáváno: ne | ano
--   sloupec_existuje   daily_call_queue.resulting_activity_id zatím není
--   kalendar_0025      migrace 0025 (Google Kalendář) už proběhla
SELECT
 (SELECT CASE WHEN count(*) > 0 THEN 'ano' ELSE 'ne' END FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'daily_call_queue' AND column_name = 'resulting_activity_id') AS sloupec_existuje,
 (SELECT CASE WHEN count(*) > 0 THEN 'ano' ELSE 'ne' END FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'lead_calendar_sync') AS kalendar_0025;

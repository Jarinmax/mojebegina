-- DENNÍ VOLÁNÍ 1.1 — kontrola PO migraci 0026 (jen čtení). Očekáváno: ano | 0 | 1
SELECT
 (SELECT CASE WHEN count(*) = 1 THEN 'ano' ELSE 'ne' END FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'daily_call_queue' AND column_name = 'resulting_activity_id') AS sloupec,
 (SELECT count(*) FROM daily_call_queue WHERE resulting_activity_id IS NOT NULL) AS vazeb,
 (SELECT count(*) FROM information_schema.table_constraints
   WHERE table_schema = 'public' AND table_name = 'daily_call_queue'
     AND constraint_name = 'daily_call_queue_resulting_activity_id_lead_activity_id_fk') AS cizi_klic;

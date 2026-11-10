-- GOOGLE KALENDÁŘ — kontrola PO migraci 0025 (jen čtení). Očekáváno: 2 | 0 | 0 | 1
SELECT
 (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('google_calendar_connections', 'lead_calendar_sync')) AS tabulek,
 (SELECT count(*) FROM google_calendar_connections) AS propojeni,
 (SELECT count(*) FROM lead_calendar_sync) AS synchronizaci,
 (SELECT count(*) FROM information_schema.table_constraints
   WHERE table_schema = 'public' AND table_name = 'lead_calendar_sync' AND constraint_type = 'FOREIGN KEY') AS cizi_klice;

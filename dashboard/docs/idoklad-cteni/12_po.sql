-- ČTENÍ iDOKLADU — kontrola PO migraci 0023 (jen čtení). Očekáváno: ano | 0 | 2
SELECT
 (SELECT CASE WHEN count(*) = 1 THEN 'ano' ELSE 'ne' END FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'idoklad_read_log') AS tabulka,
 (SELECT count(*) FROM idoklad_read_log) AS zaznamu,
 (SELECT count(*) FROM information_schema.table_constraints
   WHERE table_schema = 'public' AND table_name = 'idoklad_read_log' AND constraint_type = 'CHECK'
     AND constraint_name IN ('idoklad_read_log_status_check', 'idoklad_read_log_channel_check')) AS kontroly;

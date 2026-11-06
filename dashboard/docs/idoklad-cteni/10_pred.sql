-- ČTENÍ iDOKLADU — kontrola PŘED migrací 0023 (jen čtení).
-- Očekáváno: ne | ano
--   tabulka_existuje   idoklad_read_log zatím není
--   dic_0022           migrace 0022 (organizations.dic) už proběhla
SELECT
 (SELECT CASE WHEN count(*) > 0 THEN 'ano' ELSE 'ne' END FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'idoklad_read_log') AS tabulka_existuje,
 (SELECT CASE WHEN count(*) > 0 THEN 'ano' ELSE 'ne' END FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'dic') AS dic_0022;

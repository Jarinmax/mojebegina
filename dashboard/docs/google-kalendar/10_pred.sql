-- GOOGLE KALENDÁŘ — kontrola PŘED migrací 0025 (jen čtení).
-- Očekáváno: 0 | ano
--   tabulek_kalendare   google_calendar_connections ani lead_calendar_sync zatím nejsou
--   mcp_0024            migrace 0024 (MCP/OAuth, agent_grants) už proběhla
SELECT
 (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('google_calendar_connections', 'lead_calendar_sync')) AS tabulek_kalendare,
 (SELECT CASE WHEN count(*) > 0 THEN 'ano' ELSE 'ne' END FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'agent_grants') AS mcp_0024;

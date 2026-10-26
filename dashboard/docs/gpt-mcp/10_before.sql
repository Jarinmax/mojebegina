-- KONTROLA PŘED migrací GPT/MCP pilotu (jen čtení). Návrh 13. 10. 2026;
-- spuštění NESCHVÁLENO. Postup: GPT_MCP_PILOT.md.
-- Očekáváno: 0
--   tabulky   kolik ze 4 nových tabulek (agent_grants, agent_tokens,
--             agent_audit_log, organization_activity) už existuje — MUSÍ být 0
SELECT
 (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('agent_grants', 'agent_tokens', 'agent_audit_log', 'organization_activity')) AS tabulky;

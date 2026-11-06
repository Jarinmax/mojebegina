-- KONTROLA PO migraci GPT/MCP pilotu (jen čtení).
-- Očekáváno: 4 | 4 | 0 | 0
--   tabulky        4 nové tabulky existují
--   pojistky       CHECK omezení agent_tokens (2), agent_audit_log (1) a unikátní
--                  index idempotence (1) — MUSÍ být 4
--   souhlasy       udělené souhlasy (hned po migraci 0)
--   poznamky       poznámky u zákazníků (hned po migraci 0)
SELECT
 (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('agent_grants', 'agent_tokens', 'agent_audit_log', 'organization_activity')) AS tabulky,
 (SELECT count(*) FROM pg_constraint
   WHERE conname IN ('agent_tokens_kind_check', 'agent_tokens_code_fields_check', 'agent_audit_log_status_check'))
 + (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'agent_audit_log_idempotency_idx') AS pojistky,
 (SELECT count(*) FROM agent_grants) AS souhlasy,
 (SELECT count(*) FROM organization_activity) AS poznamky;

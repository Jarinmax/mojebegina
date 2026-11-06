-- NÁVRAT GPT/MCP pilotu: odstraní 4 tabulky z 11_migration.sql. Nespouštět
-- automaticky. NEJDŘÍV ve Vercelu smazat proměnné MCP_* (asistent se vypne)
-- a nasadit — jinak by /api/mcp hledal neexistující tabulky.
-- Pojistka: pokud už existují poznámky u zákazníků (organization_activity),
-- skript se zastaví — byly by nenávratně ztraceny. Pak je nejdřív exportovat
-- (SELECT * FROM organization_activity) a rozhodnout ručně.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'agent_grants') THEN
    RAISE EXCEPTION 'Tabulky GPT/MCP pilotu neexistují — není co vracet.';
  END IF;
  IF EXISTS (SELECT 1 FROM organization_activity) THEN
    RAISE EXCEPTION 'organization_activity obsahuje poznámky u zákazníků — nejdřív je exportujte, zastavuji.';
  END IF;
  DROP TABLE agent_audit_log;
  DROP TABLE agent_tokens;
  DROP TABLE agent_grants;
  DROP TABLE organization_activity;
END $$;

-- GPT/MCP pilot — NÁVRAT varianty B: úplné odstranění role lucy_readonly
-- z Production. NESPOUŠTĚT bez schválení. Neon SQL Editor, větev Production
-- (br-odd-surf-b2by4tja), databáze neondb.
--
-- POŘADÍ:
--   1. Ve Vercelu nejdřív smažte proměnnou s připojením přes lucy_readonly
--      (jen pilotní větev) a nasaďte znovu — asistent pak zase čte z Preview
--      kopie, nebo (bez proměnné) přestane číst Production úplně.
--   2. Pak teprve tento skript.
--
-- Skript ukončí otevřená spojení role, odebere všechna její oprávnění
-- (DROP OWNED — ruší granty a smaže, co by role případně sama založila,
-- např. velký objekt) a roli smaže. Obchodní data ani schéma se nemění.

DO $$
BEGIN
  IF coalesce(current_setting('neon.branch_id', true), '') <> 'br-odd-surf-b2by4tja' THEN
    RAISE EXCEPTION 'Toto není Production větev (br-odd-surf-b2by4tja), ale „%“ — zastavuji.',
      coalesce(current_setting('neon.branch_id', true), '?');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lucy_readonly') THEN
    RAISE NOTICE 'Role lucy_readonly neexistuje — není co vracet.';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = 'lucy_readonly') THEN
    RAISE EXCEPTION 'lucy_readonly něco vlastní (to by se stát nemělo) — zastavuji, prověřte ručně.';
  END IF;

  PERFORM pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'lucy_readonly';
  -- Vlastník DB (neondb_owner, ne superuser) roli vytvořil, a proto ji smí
  -- přidělit sám sobě; bez toho by DROP OWNED nesměl smazat případné velké
  -- objekty, které by role založila (ověřeno na PostgreSQL 16).
  BEGIN
    EXECUTE format('GRANT lucy_readonly TO %I WITH INHERIT TRUE', current_user);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- superuser nebo už člen — není potřeba
  END;
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM lucy_readonly', current_database());
  REVOKE ALL ON SCHEMA public FROM lucy_readonly;
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM lucy_readonly;
  DROP OWNED BY lucy_readonly;
  DROP ROLE lucy_readonly;
  RAISE NOTICE 'Role lucy_readonly odstraněna.';
END $$;

-- Kontrola: musí vrátit 0
SELECT count(*) AS zbyva_roli FROM pg_roles WHERE rolname = 'lucy_readonly';

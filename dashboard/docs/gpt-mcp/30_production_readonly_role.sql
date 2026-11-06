-- GPT/MCP pilot — varianta B: samostatná ČTECÍ role pro asistenta Lucy nad
-- PRODUCTION daty. NESPOUŠTĚT bez schválení. Spouští se v Neon SQL Editoru
-- na větvi Production (main, br-odd-surf-b2by4tja), databáze neondb.
--
-- Co skript dělá (vše v jednom bloku — buď celé, nebo nic):
--   1. pojistka: jiná větev než Production → zastaví se, nic nezmění,
--   2. založí roli lucy_readonly PŘES SQL (ne tlačítkem v konzoli Neonu —
--      role z konzole dostávají neon_superuser), bez práv na cokoli
--      vytvářet/měnit, s heslem předaným jen jako SCRAM otisk (heslo samo
--      se v SQL ani v historii editoru neobjeví — viz scram-verifier.mjs),
--   3. nastaví roli: default_transaction_read_only = on, statement_timeout,
--      lock_timeout, idle_in_transaction_session_timeout, search_path,
--   4. dá jen CONNECT, USAGE na schéma public a SELECT na PŘESNĚ vyjmenované
--      tabulky; u plateb a fakturačních vazeb jen na vyjmenované sloupce
--      (bez surových dat brány, externích id, payloadů a odkazů na PDF),
--   5. ověří výsledek (role nesmí mít CREATE ani nic na agent_*, neon_auth,
--      tokenech aktivací, surových platbách, payloadech faktur).
--
-- Co skript NEDĚLÁ: nemění žádná data ani schéma, nemění práva jiných rolí,
-- nesahá na neon_auth, nemění PUBLIC. Návrat: 39_production_readonly_role_rollback.sql.
--
-- ZBYTKOVÉ RIZIKO (ověřeno na skutečném PostgreSQL, viz GPT_MCP_PILOT.md):
-- default_transaction_read_only si role může v relaci vypnout. K datům se
-- tím nedostane (granty), ale PUBLIC má v Neonu na databázi právo TEMP a
-- velké objekty (lo_create) smí vytvořit každý — role tak s uniklým heslem
-- a úmyslem může v SVÉ relaci založit dočasnou tabulku nebo velký objekt.
-- Obchodní data tím nezmění. Úplnou fyzickou ochranu dá připojení přes
-- Neon READ REPLICA (read-only compute) — doporučený druhý krok.
--
-- PŘED SPUŠTĚNÍM: na svém počítači spusťte
--     node docs/gpt-mcp/scram-verifier.mjs
-- Vypíše (a) náhodné heslo → jen do správce hesel a do připojovacího řetězce
-- ve Vercelu (proměnná jen pro pilotní větev), (b) otisk SCRAM-SHA-256$… →
-- ten vložte do řádku „verifier text := …“ níže (mezi apostrofy, místo
-- zástupného textu). Heslo samotné sem NEVKLÁDEJTE.

DO $$
DECLARE
  verifier text := '<SCRAM_OTISK>';
  t text;
  -- Celé tabulky, které čtecí nástroje potřebují (výpisy používají celé řádky).
  full_tables text[] := ARRAY[
    'leads', 'lead_activity',
    'organizations', 'organization_memberships', 'locations',
    'orders', 'order_items', 'order_activity', 'invoices',
    'products', 'product_variants', 'product_categories',
    'company_nodes', 'company_node_activity',
    'focus_projects', 'focus_project_activity',
    'daily_call_queue',
    'user_roles', 'user_profiles'
  ];
  -- Tabulky, které v Production zatím nemusí existovat (přijdou s pilotem).
  optional_tables text[] := ARRAY['organization_activity'];
BEGIN
  -- 1. Pojistka větve
  IF coalesce(current_setting('neon.branch_id', true), '') <> 'br-odd-surf-b2by4tja' THEN
    RAISE EXCEPTION 'Toto není Production větev (br-odd-surf-b2by4tja), ale „%“ — zastavuji, nic se nezměnilo.',
      coalesce(current_setting('neon.branch_id', true), '?');
  END IF;
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Očekávaná databáze neondb, jste v „%“ — zastavuji.', current_database();
  END IF;
  IF verifier NOT LIKE 'SCRAM-SHA-256$4096:%' THEN
    RAISE EXCEPTION 'Do řádku verifier vložte otisk ze scram-verifier.mjs (začíná SCRAM-SHA-256$4096:).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lucy_readonly') THEN
    RAISE EXCEPTION 'Role lucy_readonly už existuje — nejdřív 39_production_readonly_role_rollback.sql, pak znovu.';
  END IF;

  -- 2. Role: jen přihlášení, nic jiného
  EXECUTE format(
    'CREATE ROLE lucy_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD %L',
    verifier
  );

  -- 3. Nastavení každé relace této role
  ALTER ROLE lucy_readonly SET default_transaction_read_only = on;
  ALTER ROLE lucy_readonly SET statement_timeout = '15s';
  ALTER ROLE lucy_readonly SET lock_timeout = '2s';
  ALTER ROLE lucy_readonly SET idle_in_transaction_session_timeout = '10s';
  ALTER ROLE lucy_readonly SET search_path = public;

  -- 4. Oprávnění
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO lucy_readonly', current_database());
  GRANT USAGE ON SCHEMA public TO lucy_readonly;

  FOREACH t IN ARRAY full_tables LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO lucy_readonly', t);
  END LOOP;
  FOREACH t IN ARRAY optional_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO lucy_readonly', t);
    END IF;
  END LOOP;

  -- Platby: bez external_id (id u Stripe/banky/formuláře) a raw (surová data brány).
  GRANT SELECT (id, order_id, source, method, direction, status, amount_hal, currency, vs,
                refund_of_payment_id, superseded_by_payment_id, match_status, occurred_at,
                recorded_by_user_id, note, created_at, updated_at)
    ON public.payments TO lucy_readonly;
  -- Stav úhrady objednávky (pohled jen s částkami).
  GRANT SELECT ON public.order_payment_balance TO lucy_readonly;
  -- Vazba faktury na fakturační systém: jen stav a číslo dokladu, bez
  -- external_id, odkazu, úložiště PDF, chyb a payloadů požadavku/odpovědi.
  GRANT SELECT (id, invoice_id, provider, state, external_number, number_series, issued_at, created_at, updated_at)
    ON public.invoice_provider_links TO lucy_readonly;

  -- 5. Kontrola výsledku (při chybě se celý blok vrátí). Tvrdou ochranou
  --    jsou GRANTY — default_transaction_read_only si role může v relaci
  --    sama vypnout, proto se tu ověřuje, že ani pak nemá kam zapsat.
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = 'lucy_readonly') THEN
    RAISE EXCEPTION 'lucy_readonly je členem jiné role (zdědila by její práva) — zastavuji.';
  END IF;
  IF has_database_privilege('lucy_readonly', current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'lucy_readonly by mohla vytvářet schémata — zastavuji.';
  END IF;
  FOR t IN SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema' LOOP
    IF has_schema_privilege('lucy_readonly', t, 'CREATE') THEN
      RAISE EXCEPTION 'lucy_readonly by mohla vytvářet objekty ve schématu % (např. přes PUBLIC) — zastavuji.', t;
    END IF;
    IF t <> 'public' AND has_schema_privilege('lucy_readonly', t, 'USAGE') THEN
      RAISE EXCEPTION 'lucy_readonly má přístup do schématu % (např. neon_auth) — zastavuji.', t;
    END IF;
  END LOOP;
  -- Přesná sada: čitelné celé tabulky = jen vyjmenované; jinde žádný sloupec
  -- (ani přes PUBLIC); payments a invoice_provider_links jen vyjmenované sloupce.
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p', 'f') LOOP
    IF t = ANY (full_tables || optional_tables || ARRAY['order_payment_balance']) THEN
      CONTINUE;
    END IF;
    IF t IN ('payments', 'invoice_provider_links') THEN
      IF has_table_privilege('lucy_readonly', 'public.' || quote_ident(t), 'SELECT') THEN
        RAISE EXCEPTION 'lucy_readonly vidí CELOU tabulku % (má vidět jen vybrané sloupce) — zastavuji.', t;
      END IF;
      CONTINUE;
    END IF;
    IF has_any_column_privilege('lucy_readonly', 'public.' || quote_ident(t), 'SELECT') THEN
      RAISE EXCEPTION 'lucy_readonly vidí tabulku %, která není na seznamu — zastavuji.', t;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE grantee = 'lucy_readonly' AND table_schema = 'public' AND table_name = 'payments'
      AND column_name NOT IN ('id', 'order_id', 'source', 'method', 'direction', 'status', 'amount_hal', 'currency', 'vs',
                              'refund_of_payment_id', 'superseded_by_payment_id', 'match_status', 'occurred_at',
                              'recorded_by_user_id', 'note', 'created_at', 'updated_at')
  ) OR EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE grantee = 'lucy_readonly' AND table_schema = 'public' AND table_name = 'invoice_provider_links'
      AND column_name NOT IN ('id', 'invoice_id', 'provider', 'state', 'external_number', 'number_series', 'issued_at', 'created_at', 'updated_at')
  ) OR has_column_privilege('lucy_readonly', 'public.payments', 'raw', 'SELECT')
    OR has_column_privilege('lucy_readonly', 'public.payments', 'external_id', 'SELECT')
    OR has_column_privilege('lucy_readonly', 'public.invoice_provider_links', 'request_payload', 'SELECT')
    OR has_column_privilege('lucy_readonly', 'public.invoice_provider_links', 'response_ref', 'SELECT')
    OR has_column_privilege('lucy_readonly', 'public.invoice_provider_links', 'external_url', 'SELECT') THEN
    RAISE EXCEPTION 'lucy_readonly vidí surová platební nebo fakturační data — zastavuji.';
  END IF;
  -- Žádný zápis nikde (ani do tabulek, na které vidí).
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p', 'f') LOOP
    IF has_any_column_privilege('lucy_readonly', 'public.' || quote_ident(t), 'INSERT')
       OR has_any_column_privilege('lucy_readonly', 'public.' || quote_ident(t), 'UPDATE')
       OR has_table_privilege('lucy_readonly', 'public.' || quote_ident(t), 'DELETE')
       OR has_table_privilege('lucy_readonly', 'public.' || quote_ident(t), 'TRUNCATE')
       OR has_table_privilege('lucy_readonly', 'public.' || quote_ident(t), 'REFERENCES')
       OR has_table_privilege('lucy_readonly', 'public.' || quote_ident(t), 'TRIGGER') THEN
      RAISE EXCEPTION 'lucy_readonly smí měnit tabulku % — zastavuji.', t;
    END IF;
  END LOOP;
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'S' LOOP
    IF has_sequence_privilege('lucy_readonly', 'public.' || quote_ident(t), 'USAGE')
       OR has_sequence_privilege('lucy_readonly', 'public.' || quote_ident(t), 'UPDATE') THEN
      RAISE EXCEPTION 'lucy_readonly smí posouvat sekvenci % — zastavuji.', t;
    END IF;
  END LOOP;
  -- Funkce SECURITY DEFINER (běží s právy vlastníka) mimo systémové schéma.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND has_schema_privilege('lucy_readonly', n.oid, 'USAGE')
      AND has_function_privilege('lucy_readonly', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'lucy_readonly může volat funkci SECURITY DEFINER — zastavuji, prověřte ručně.';
  END IF;
  -- Rozšíření, přes která by šlo číst/psát mimo granty (spojení jinam, soubory).
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname IN ('dblink', 'postgres_fdw', 'file_fdw', 'adminpack', 'pg_cron', 'plpython3u', 'plperlu')) THEN
    RAISE EXCEPTION 'V databázi je rozšíření, které by roli dalo cestu mimo granty — zastavuji, prověřte ručně.';
  END IF;

  RAISE NOTICE 'Role lucy_readonly je připravená: jen čtení vyjmenovaných tabulek, default_transaction_read_only = on.';
END $$;

-- Kontrola po spuštění (jen čte):
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls, rolconnlimit,
       (SELECT array_agg(s) FROM unnest(rolconfig) s) AS nastaveni
FROM pg_roles WHERE rolname = 'lucy_readonly';

SELECT table_name, string_agg(DISTINCT privilege_type, ', ') AS prava_na_celou_tabulku
FROM information_schema.role_table_grants WHERE grantee = 'lucy_readonly'
GROUP BY table_name ORDER BY table_name;

SELECT table_name, string_agg(column_name, ', ' ORDER BY column_name) AS jen_sloupce
FROM information_schema.column_privileges
WHERE grantee = 'lucy_readonly' AND table_name IN ('payments', 'invoice_provider_links')
GROUP BY table_name;

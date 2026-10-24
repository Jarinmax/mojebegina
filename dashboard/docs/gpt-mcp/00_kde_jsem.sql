-- KDE JSEM? (jen čtení) — spustit jako PRVNÍ v Neon SQL Editoru po výběru větve.
-- Očekáváno na Preview větvi pilotu (preview/claude/upbeat-goodall-pj64t5):
--   branch_id   = br-… té větve (zkontrolovat v Neon Console › Branches)
--   je_production = ne      ← MUSÍ být „ne“, jinak NIC dalšího nespouštět
--   tabulek     = 30 (= main po migraci 0023: 29 tabulek + pohled order_payment_balance)
--   weight_g    = 1, pilot = 0
-- Production `main` (ověřeno read-only 13. 10. 2026): br-odd-surf-b2by4tja,
--   timeline 70a96b3677653646e65343cae8e27182, endpoint ep-orange-lake-b2zctiy8.
SELECT
  current_setting('neon.branch_id', true) AS branch_id,
  current_setting('neon.timeline_id', true) AS timeline_id,
  current_setting('neon.endpoint_id', true) AS endpoint_id,
  CASE WHEN current_setting('neon.timeline_id', true) = '70a96b3677653646e65343cae8e27182'
       THEN 'ANO — STOP' ELSE 'ne' END AS je_production,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') AS tabulek,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'weight_g') AS weight_g,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
    AND table_name IN ('agent_grants', 'agent_tokens', 'agent_audit_log', 'organization_activity')) AS pilot;

-- KONTROLA PO migraci (jen čtení).
-- Očekáváno: 2 | 3 | 0 | 0
--   tabulky    obě nové tabulky existují
--   pojistky   CHECK oprávnění + CHECK odebrání + unikátní aktivní udělení — 3
--   udeleni    aktivních udělení (hned po migraci 0 — udělení je 20_udelit.sql)
--   otevreni   záznamů auditu (hned po migraci 0)
SELECT
 (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('user_permissions', 'customer_card_preview_log')) AS tabulky,
 (SELECT count(*) FROM pg_constraint WHERE conname IN ('user_permissions_permission_check', 'user_permissions_revoked_by'))
 + (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'user_permissions_one_active') AS pojistky,
 (SELECT count(*) FROM user_permissions WHERE revoked_at IS NULL) AS udeleni,
 (SELECT count(*) FROM customer_card_preview_log) AS otevreni;

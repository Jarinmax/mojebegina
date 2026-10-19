-- KONTROLA PŘED migrací náhledu zákaznické karty (jen čtení).
-- Očekáváno: 0 | 4 | 4
--   tabulky   user_permissions / customer_card_preview_log už existují — MUSÍ být 0
--   ucty      kolik ze 4 user_id existuje v user_profiles — MUSÍ být 4
--   vedeni    kolik z nich má roli ADMIN nebo EXECUTIVE — MUSÍ být 4
-- Pod tím (druhý dotaz) jména a e-maily ke kontrole očima: identifikátorem
-- je VÝHRADNĚ user_id, jméno/e-mail jen pro člověka.
SELECT
 (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('user_permissions', 'customer_card_preview_log')) AS tabulky,
 (SELECT count(*) FROM user_profiles WHERE user_id IN (
   'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c', 'f9f93f03-92b0-4724-becd-c0a3576b5275',
   'fdc7b836-2325-4568-b9b7-5ac579cd8972', '06240ac4-c050-47ea-998c-6c81389edf9f')) AS ucty,
 (SELECT count(DISTINCT user_id) FROM user_roles WHERE system_role IN ('ADMIN', 'EXECUTIVE') AND user_id IN (
   'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c', 'f9f93f03-92b0-4724-becd-c0a3576b5275',
   'fdc7b836-2325-4568-b9b7-5ac579cd8972', '06240ac4-c050-47ea-998c-6c81389edf9f')) AS vedeni;

SELECT p.user_id, p.name, p.email,
       (SELECT string_agg(r.system_role, ', ' ORDER BY r.system_role) FROM user_roles r WHERE r.user_id = p.user_id) AS role
FROM user_profiles p
WHERE p.user_id IN ('de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c', 'f9f93f03-92b0-4724-becd-c0a3576b5275',
                    'fdc7b836-2325-4568-b9b7-5ac579cd8972', '06240ac4-c050-47ea-998c-6c81389edf9f')
ORDER BY p.name;

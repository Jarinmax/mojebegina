-- GOOGLE KALENDÁŘ — převod starých termínů „jen datum“ (K8), kontrola PŘED (jen čtení).
-- Starý kód ukládal termín bez času jako 12:00 UTC. Nový kód termín zobrazuje
-- i synchronizuje s časem → bez převodu by se ukázal jako 13:00 / 14:00.
-- Očekáváno v Production (ověřeno read-only 26. 10. 2026): 16 | 16 | 0 | ne
--   k_prevodu         termíny přesně v 12:00:00.000 UTC
--   terminu_celkem    všechny vyplněné termíny
--   synchronizaci     řádky lead_calendar_sync — MUSÍ být 0 (nový kód ještě neběží)
--   zaloha_existuje   tabulka zálohy převodu zatím není
SELECT
 (SELECT count(*) FROM leads WHERE next_follow_up_at IS NOT NULL
    AND (next_follow_up_at AT TIME ZONE 'UTC')::time = time '12:00') AS k_prevodu,
 (SELECT count(*) FROM leads WHERE next_follow_up_at IS NOT NULL) AS terminu_celkem,
 (SELECT count(*) FROM lead_calendar_sync) AS synchronizaci,
 (SELECT CASE WHEN count(*) > 0 THEN 'ano' ELSE 'ne' END FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'lead_follow_up_k8_backup') AS zaloha_existuje;

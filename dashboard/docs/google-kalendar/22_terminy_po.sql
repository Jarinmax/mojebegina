-- GOOGLE KALENDÁŘ — převod K8, kontrola PO (jen čtení).
-- Očekáváno v Production: 16 | 0 | 16 | 0
--   zalohovano        řádky zálohy
--   zbyva_12_utc      termíny stále v 12:00 UTC (má být 0)
--   v_9_praha         zálohované leady, které mají teď 09:00 Europe/Prague
--   jiny_den          převod nesmí změnit den v Praze (má být 0)
SELECT
 (SELECT count(*) FROM lead_follow_up_k8_backup) AS zalohovano,
 (SELECT count(*) FROM leads WHERE next_follow_up_at IS NOT NULL
    AND (next_follow_up_at AT TIME ZONE 'UTC')::time = time '12:00') AS zbyva_12_utc,
 (SELECT count(*) FROM leads l JOIN lead_follow_up_k8_backup b ON b.lead_id = l.id
   WHERE (l.next_follow_up_at AT TIME ZONE 'Europe/Prague')::time = time '09:00') AS v_9_praha,
 (SELECT count(*) FROM leads l JOIN lead_follow_up_k8_backup b ON b.lead_id = l.id
   WHERE (l.next_follow_up_at AT TIME ZONE 'Europe/Prague')::date <> (b.old_next_follow_up_at AT TIME ZONE 'Europe/Prague')::date) AS jiny_den;

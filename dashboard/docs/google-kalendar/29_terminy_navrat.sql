-- GOOGLE KALENDÁŘ — návrat převodu K8. Vrátí původní hodnotu (12:00 UTC) jen
-- tam, kde termín od převodu NIKDO nezměnil (= má stále převedenou hodnotu).
-- Termíny, které mezitím obchodník upravil, se nepřepisují a zůstanou v záloze
-- (vypíše se jejich počet). Když se vrátí vše, záloha se odstraní a převod lze
-- případně spustit znovu.
DO $$
DECLARE
  restored integer;
  remaining integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_follow_up_k8_backup') THEN
    RAISE EXCEPTION 'Záloha lead_follow_up_k8_backup neexistuje — není co vracet, zastavuji.';
  END IF;

  WITH restored_rows AS (
    UPDATE leads l SET next_follow_up_at = b.old_next_follow_up_at
      FROM lead_follow_up_k8_backup b
     WHERE b.lead_id = l.id AND l.next_follow_up_at = b.new_next_follow_up_at
    RETURNING l.id
  )
  DELETE FROM lead_follow_up_k8_backup WHERE lead_id IN (SELECT id FROM restored_rows);
  GET DIAGNOSTICS restored = ROW_COUNT;

  SELECT count(*) INTO remaining FROM lead_follow_up_k8_backup;
  IF remaining = 0 THEN
    DROP TABLE lead_follow_up_k8_backup;
    RAISE NOTICE 'Návrat K8: vráceno % termínů, záloha odstraněna.', restored;
  ELSE
    RAISE NOTICE 'Návrat K8: vráceno % termínů; % termínů mezitím někdo změnil — ponechány, zůstávají v záloze.', restored, remaining;
  END IF;
END $$;

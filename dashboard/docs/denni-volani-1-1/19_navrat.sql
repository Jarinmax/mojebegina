-- DENNÍ VOLÁNÍ 1.1 — návrat migrace 0026. Kód Denního volání 1.1 musí být
-- předtím vrácený. Zastaví se, pokud už existují vazby na aktivity: jejich
-- odstranění by „Dnes vyřízeno“ připravilo o dohledatelný výsledek hovoru
-- (zápis hovoru samotný v lead_activity zůstává vždy). Pokud je ztráta
-- vazeb vědomě schválená, nejdřív:
--   UPDATE daily_call_queue SET resulting_activity_id = NULL WHERE resulting_activity_id IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM daily_call_queue WHERE resulting_activity_id IS NOT NULL) THEN
    RAISE EXCEPTION 'V daily_call_queue už jsou vazby na aktivity — návrat by je smazal, zastavuji.';
  END IF;
  ALTER TABLE "daily_call_queue" DROP CONSTRAINT "daily_call_queue_resulting_activity_id_lead_activity_id_fk";
  ALTER TABLE "daily_call_queue" DROP COLUMN "resulting_activity_id";
  RAISE NOTICE 'Návrat 0026: sloupec daily_call_queue.resulting_activity_id odstraněn.';
END $$;

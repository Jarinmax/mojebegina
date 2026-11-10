-- DENNÍ VOLÁNÍ 1.1 — migrace 0026: vazba vyřízené položky fronty na aktivitu
-- v CRM, která jejím vyřízením vznikla. Stejné DDL jako
-- drizzle/0026_phase_21_daily_calls_worker_history.sql. Jen nový nullable
-- sloupec s cizím klíčem; staré vyřízené položky zůstávají NULL (žádný
-- odhadovaný backfill). Stávající kód s novým schématem funguje dál.
-- Spustit PŘED nasazením kódu Denního volání 1.1.
-- Jeden blok = jedna transakce: pojistka nebo chyba → nic se nezmění.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_calendar_sync') THEN
    RAISE EXCEPTION 'Chybí migrace 0025 (Google Kalendář) — nejdřív docs/google-kalendar/11_migrace_0025.sql, zastavuji.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
               AND table_name = 'daily_call_queue' AND column_name = 'resulting_activity_id') THEN
    RAISE EXCEPTION 'Sloupec daily_call_queue.resulting_activity_id už existuje — migrace 0026 už proběhla, zastavuji.';
  END IF;
  ALTER TABLE "daily_call_queue" ADD COLUMN "resulting_activity_id" uuid;
  ALTER TABLE "daily_call_queue" ADD CONSTRAINT "daily_call_queue_resulting_activity_id_lead_activity_id_fk" FOREIGN KEY ("resulting_activity_id") REFERENCES "public"."lead_activity"("id") ON DELETE set null ON UPDATE no action;
  RAISE NOTICE 'Migrace 0026: sloupec daily_call_queue.resulting_activity_id založen.';
END $$;

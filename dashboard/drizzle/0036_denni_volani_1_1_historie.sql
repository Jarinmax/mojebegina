-- Denní volání 1.1 — daily_call_queue.resulting_activity_id: nullable FK na
-- PRÁVĚ TEN lead_activity záznam, který vznikl vyřízením položky fronty
-- (nastavuje se v tomtéž atomickém CTE jako přechod na status='done',
-- dailyCallsValidation.ts: buildLogDailyCallOutcomeQuery). Staré `done` řádky
-- zůstávají NULL, žádný odhadovaný backfill. ON DELETE SET NULL.
ALTER TABLE "daily_call_queue" ADD COLUMN "resulting_activity_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_call_queue" ADD CONSTRAINT "daily_call_queue_resulting_activity_id_lead_activity_id_fk" FOREIGN KEY ("resulting_activity_id") REFERENCES "public"."lead_activity"("id") ON DELETE set null ON UPDATE no action;
-- Security Phase 21 (Denní volání 1.1 — historie a "Dnes vyřízeno")
--
-- Nullable FK ukazatel z daily_call_queue na PRÁVĚ TEN lead_activity
-- záznam, který vznikl vyřízením téhle konkrétní položky fronty. Žádná
-- kopie textu poznámky — poznámka se nadále autoritativně čte z
-- lead_activity. Nastavuje se výhradně v rámci stejného atomického CTE
-- jako přechod položky na status='done' (lib/data/dailyCallsValidation.ts:
-- buildLogDailyCallOutcomeQuery), nikdy samostatným zápisem.
--
-- Staré `done` řádky z doby před touto migrací zůstávají s NULL — žádný
-- odhadovaný backfill (schváleno explicitně).
--
-- ON DELETE SET NULL: smazání aktivity (dnes nikde v appce neprováděné)
-- nesmí nikdy zablokovat ani shodit zápis/retenci daily_call_queue —
-- ztráta ukazatele je bezpečná degradace (položka přijde jen o dohledaný
-- detail, ne o integritu).
ALTER TABLE "daily_call_queue" ADD COLUMN "resulting_activity_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_call_queue" ADD CONSTRAINT "daily_call_queue_resulting_activity_id_lead_activity_id_fk" FOREIGN KEY ("resulting_activity_id") REFERENCES "public"."lead_activity"("id") ON DELETE set null ON UPDATE no action;
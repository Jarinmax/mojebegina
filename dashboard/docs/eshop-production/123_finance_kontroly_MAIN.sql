-- 123: Finance – kontroly a audit – nová tabulka auditního deníku finančních kontrol
-- (jen nová tabulka, nic existujícího se nemění). Stejné DDL jako
-- drizzle/0046_finance_kontroly.sql. Dá se spustit opakovaně.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "finance_check_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "check_key" text NOT NULL,
  "finding_key" text,
  "action" text NOT NULL,
  "note" text,
  "snapshot" jsonb,
  "created_by_user_id" text NOT NULL,
  "author_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "finance_check_log_action_check" CHECK ("finance_check_log"."action" IN ('run','ok','fixed','note')),
  CONSTRAINT "finance_check_log_finding_action" CHECK ("finance_check_log"."action" IN ('run','note') OR "finance_check_log"."finding_key" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "finance_check_log_check_idx" ON "finance_check_log" USING btree ("check_key","created_at");
COMMIT;
SELECT count(*) AS zapisu_v_denniku FROM finance_check_log;

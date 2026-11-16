-- 124: Legislativní audit – nová tabulka pro právní reporty (jen nová tabulka, nic existujícího se nemění).
-- Stejné DDL jako drizzle/0047_legislativni_audit.sql. Dá se spustit opakovaně.
-- Spustit jednou v Neon SQL Editoru na Production (větev main).
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "legal_audit_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_date" date NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "body" text NOT NULL,
  "urgent_count" integer DEFAULT 0 NOT NULL,
  "source" text DEFAULT 'agent' NOT NULL,
  "source_ref" text,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "legal_audit_reports_source_ref_key" UNIQUE("source","source_ref"),
  CONSTRAINT "legal_audit_reports_kind_check" CHECK ("legal_audit_reports"."kind" IN ('mesicni','upozorneni','mimoradny')),
  CONSTRAINT "legal_audit_reports_urgent_check" CHECK ("legal_audit_reports"."urgent_count" >= 0)
);
CREATE INDEX IF NOT EXISTS "legal_audit_reports_date_idx" ON "legal_audit_reports" USING btree ("report_date");
COMMIT;
SELECT count(*) AS reportu FROM legal_audit_reports;

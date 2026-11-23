-- 146: Archiv iDokladu (Lucie 23. 11. 2026) – tabulka idoklad_archive (migrace 0066).
-- Předplatné iDokladu končí 4. 12. 2026 (tarif Zdarma nemá API) → všechny faktury a dobropisy
-- i s PDF se zkopírují sem. Skript jen zakládá prázdnou tabulku; data doplní MojeBegina sama.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;
CREATE TABLE "idoklad_archive" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_kind" text NOT NULL,
	"idoklad_id" integer NOT NULL,
	"number" text NOT NULL,
	"issue_date" date,
	"due_date" date,
	"paid_date" date,
	"payment" text NOT NULL,
	"total_kc" numeric(12, 2),
	"paid_kc" numeric(12, 2),
	"variable_symbol" text,
	"partner_name" text,
	"partner_ico" text,
	"partner_email" text,
	"raw" jsonb NOT NULL,
	"pdf_base64" text,
	"pdf_filename" text,
	"pdf_fetched_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idoklad_archive_kind_id" UNIQUE("doc_kind","idoklad_id"),
	CONSTRAINT "idoklad_archive_kind" CHECK ("idoklad_archive"."doc_kind" IN ('invoice', 'credit_note'))
);

CREATE INDEX "idoklad_archive_number_idx" ON "idoklad_archive" USING btree ("number");
CREATE INDEX "idoklad_archive_issue_idx" ON "idoklad_archive" USING btree ("issue_date");
CREATE INDEX "idoklad_archive_ico_idx" ON "idoklad_archive" USING btree ("partner_ico");
COMMIT;
SELECT to_regclass('public.idoklad_archive') AS tabulka;

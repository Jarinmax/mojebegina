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
--> statement-breakpoint
CREATE INDEX "idoklad_archive_number_idx" ON "idoklad_archive" USING btree ("number");--> statement-breakpoint
CREATE INDEX "idoklad_archive_issue_idx" ON "idoklad_archive" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "idoklad_archive_ico_idx" ON "idoklad_archive" USING btree ("partner_ico");
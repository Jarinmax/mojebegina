CREATE TABLE "meta_lead_imports" (
	"meta_lead_id" text PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"campaign_name" text,
	"form_name" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_lead_imports_outcome_check" CHECK ("meta_lead_imports"."outcome" IN ('created', 'matched'))
);
--> statement-breakpoint
ALTER TABLE "meta_lead_imports" ADD CONSTRAINT "meta_lead_imports_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_lead_imports_lead_idx" ON "meta_lead_imports" USING btree ("lead_id");
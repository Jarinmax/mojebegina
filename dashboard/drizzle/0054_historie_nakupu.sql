CREATE TABLE "lead_purchase_history" (
	"lead_id" uuid PRIMARY KEY NOT NULL,
	"matched_by" text NOT NULL,
	"invoices" integer NOT NULL,
	"total_kc" numeric(12, 2) NOT NULL,
	"first_day" date,
	"last_day" date,
	"items" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_purchase_history" ADD CONSTRAINT "lead_purchase_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
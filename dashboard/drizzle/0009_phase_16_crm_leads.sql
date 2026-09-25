CREATE TABLE "lead_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"author_name" text,
	"kind" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"city" text,
	"address" text,
	"venue_type" text,
	"ico" text,
	"source" text NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"owner_user_id" text,
	"acquired_by_user_id" text,
	"last_contacted_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"next_step_note" text,
	"converted_organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "acquired_by_user_id" text;--> statement-breakpoint
ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_organization_id_organizations_id_fk" FOREIGN KEY ("converted_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_activity_lead_id_idx" ON "lead_activity" USING btree ("lead_id","created_at");
CREATE TABLE "google_calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"google_account_email" text NOT NULL,
	"google_calendar_id" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"granted_scopes" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "google_calendar_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "lead_calendar_sync" (
	"lead_id" uuid PRIMARY KEY NOT NULL,
	"google_event_id" text,
	"synced_next_follow_up_at" timestamp with time zone,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_calendar_sync_status_check" CHECK ("lead_calendar_sync"."sync_status" IN ('pending','synced','failed'))
);
--> statement-breakpoint
ALTER TABLE "lead_calendar_sync" ADD CONSTRAINT "lead_calendar_sync_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
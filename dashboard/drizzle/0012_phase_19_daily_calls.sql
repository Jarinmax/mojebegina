CREATE TABLE "daily_call_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text NOT NULL,
	"added_by" text NOT NULL,
	"added_for_date" text NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"done_at" timestamp with time zone,
	"done_by" text,
	"removed_at" timestamp with time zone,
	"removed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_call_queue_status_check" CHECK ("daily_call_queue"."status" IN ('pending','done','removed')),
	CONSTRAINT "daily_call_queue_source_check" CHECK ("daily_call_queue"."source" IN ('auto','manual')),
	CONSTRAINT "daily_call_queue_published_pair_check" CHECK (("daily_call_queue"."published_at" IS NULL) = ("daily_call_queue"."published_by" IS NULL)),
	CONSTRAINT "daily_call_queue_done_pair_check" CHECK (("daily_call_queue"."done_at" IS NULL) = ("daily_call_queue"."done_by" IS NULL)),
	CONSTRAINT "daily_call_queue_removed_pair_check" CHECK (("daily_call_queue"."removed_at" IS NULL) = ("daily_call_queue"."removed_by" IS NULL)),
	CONSTRAINT "daily_call_queue_done_status_check" CHECK (("daily_call_queue"."status" = 'done') = ("daily_call_queue"."done_at" IS NOT NULL)),
	CONSTRAINT "daily_call_queue_removed_status_check" CHECK (("daily_call_queue"."status" = 'removed') = ("daily_call_queue"."removed_at" IS NOT NULL)),
	CONSTRAINT "daily_call_queue_done_implies_published_check" CHECK ("daily_call_queue"."status" <> 'done' OR "daily_call_queue"."published_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "daily_call_queue" ADD CONSTRAINT "daily_call_queue_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_call_queue_status_position_idx" ON "daily_call_queue" USING btree ("status","position");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_call_queue_lead_pending_idx" ON "daily_call_queue" USING btree ("lead_id") WHERE "daily_call_queue"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "daily_call_queue_position_pending_idx" ON "daily_call_queue" USING btree ("position") WHERE "daily_call_queue"."status" = 'pending';
CREATE TABLE "idoklad_read_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"tool" text NOT NULL,
	"args" jsonb NOT NULL,
	"status" text NOT NULL,
	"result_count" integer,
	"idoklad_requests" integer,
	"duration_ms" integer,
	"error" text,
	CONSTRAINT "idoklad_read_log_status_check" CHECK ("idoklad_read_log"."status" IN ('started', 'ok', 'error', 'denied', 'rate_limited', 'invalid')),
	CONSTRAINT "idoklad_read_log_channel_check" CHECK ("idoklad_read_log"."channel" ~ '^(ui|mcp:[a-z0-9_-]{1,40})$')
);
--> statement-breakpoint
CREATE INDEX "idoklad_read_log_user_created_idx" ON "idoklad_read_log" USING btree ("user_id","created_at");
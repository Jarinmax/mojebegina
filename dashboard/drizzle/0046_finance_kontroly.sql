CREATE TABLE "finance_check_log" (
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
--> statement-breakpoint
CREATE INDEX "finance_check_log_check_idx" ON "finance_check_log" USING btree ("check_key","created_at");
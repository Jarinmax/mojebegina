CREATE TABLE "economy_entry_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb NOT NULL,
	"reason" text,
	"source" text DEFAULT 'agent' NOT NULL,
	"changed_by_user_id" text,
	"changed_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_entry_changes_action_check" CHECK ("economy_entry_changes"."action" IN ('update','delete'))
);
--> statement-breakpoint
ALTER TABLE "economy_entry_changes" ADD CONSTRAINT "economy_entry_changes_entry_id_economy_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."economy_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "economy_entry_changes_entry_idx" ON "economy_entry_changes" USING btree ("entry_id","created_at");
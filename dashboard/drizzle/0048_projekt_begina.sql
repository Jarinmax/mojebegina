CREATE TABLE "project_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area" text NOT NULL,
	"kind" text NOT NULL,
	"entry_date" date NOT NULL,
	"title" text,
	"body" text,
	"url" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"created_by_user_id" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "project_entries_source_ref_key" UNIQUE("source","source_ref"),
	CONSTRAINT "project_entries_kind_check" CHECK ("project_entries"."kind" IN ('status','decision','output'))
);
--> statement-breakpoint
CREATE INDEX "project_entries_area_kind_idx" ON "project_entries" USING btree ("area","kind","created_at");
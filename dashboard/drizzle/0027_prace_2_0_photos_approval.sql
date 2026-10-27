CREATE TABLE "work_task_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "work_task_photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "work_task_photos_content_type_check" CHECK ("work_task_photos"."content_type" = 'image/jpeg'),
	CONSTRAINT "work_task_photos_delete_pair_check" CHECK (("work_task_photos"."deleted_at" IS NULL) = ("work_task_photos"."deleted_by" IS NULL)),
	CONSTRAINT "work_task_photos_size_check" CHECK ("work_task_photos"."size_bytes" > 0 AND "work_task_photos"."size_bytes" <= 4194304)
);
--> statement-breakpoint
ALTER TABLE "work_task_activity" DROP CONSTRAINT "work_task_activity_kind_check";--> statement-breakpoint
ALTER TABLE "work_tasks" DROP CONSTRAINT "work_tasks_status_check";--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "photo_requirement" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "requires_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "submitted_by" text;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "return_reason" text;--> statement-breakpoint
ALTER TABLE "work_task_photos" ADD CONSTRAINT "work_task_photos_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_task_photos_task_idx" ON "work_task_photos" USING btree ("task_id","uploaded_at");--> statement-breakpoint
ALTER TABLE "work_task_activity" ADD CONSTRAINT "work_task_activity_kind_check" CHECK ("work_task_activity"."kind" IN ('created','done','reopened','updated','priority_changed','reassigned','cancelled','photo_added','photo_removed','submitted','approved','returned'));--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_photo_requirement_check" CHECK ("work_tasks"."photo_requirement" IN ('none','optional','required'));--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_submit_pair_check" CHECK (("work_tasks"."submitted_at" IS NULL) = ("work_tasks"."submitted_by" IS NULL));--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_approve_pair_check" CHECK (("work_tasks"."approved_at" IS NULL) = ("work_tasks"."approved_by" IS NULL));--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_submitted_status_check" CHECK ("work_tasks"."status" <> 'submitted' OR "work_tasks"."submitted_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_returned_status_check" CHECK ("work_tasks"."status" <> 'returned' OR "work_tasks"."return_reason" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_status_check" CHECK ("work_tasks"."status" IN ('open','submitted','returned','done','cancelled'));
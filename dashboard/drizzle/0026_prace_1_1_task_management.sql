ALTER TABLE "work_task_activity" DROP CONSTRAINT "work_task_activity_kind_check";--> statement-breakpoint
ALTER TABLE "work_tasks" DROP CONSTRAINT "work_tasks_status_check";--> statement-breakpoint
ALTER TABLE "work_task_activity" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "work_task_activity" ADD CONSTRAINT "work_task_activity_kind_check" CHECK ("work_task_activity"."kind" IN ('created','done','reopened','updated','priority_changed','reassigned','cancelled'));--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_cancel_pair_check" CHECK (("work_tasks"."cancelled_at" IS NULL) = ("work_tasks"."cancelled_by" IS NULL));--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_cancel_status_check" CHECK (("work_tasks"."status" = 'cancelled') = ("work_tasks"."cancelled_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_status_check" CHECK ("work_tasks"."status" IN ('open','done','cancelled'));
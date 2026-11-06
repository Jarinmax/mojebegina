CREATE TABLE "work_task_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_task_activity_kind_check" CHECK ("work_task_activity"."kind" IN ('created','done','reopened'))
);
--> statement-breakpoint
CREATE TABLE "work_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_user_id" text NOT NULL,
	"created_by" text NOT NULL,
	"due_date" date,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_tasks_priority_check" CHECK ("work_tasks"."priority" IN ('normal','urgent')),
	CONSTRAINT "work_tasks_status_check" CHECK ("work_tasks"."status" IN ('open','done')),
	CONSTRAINT "work_tasks_done_pair_check" CHECK (("work_tasks"."done_at" IS NULL) = ("work_tasks"."done_by" IS NULL)),
	CONSTRAINT "work_tasks_done_status_check" CHECK (("work_tasks"."status" = 'done') = ("work_tasks"."done_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "work_task_activity" ADD CONSTRAINT "work_task_activity_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_task_activity_task_idx" ON "work_task_activity" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "work_tasks_assignee_status_idx" ON "work_tasks" USING btree ("assignee_user_id","status","due_date");
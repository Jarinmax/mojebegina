ALTER TABLE "collaborator_work_entries" ADD COLUMN "reward_type" text DEFAULT 'flat' NOT NULL;--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD COLUMN "rate_kc" integer;--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD CONSTRAINT "collaborator_work_entries_reward_type_check" CHECK ("collaborator_work_entries"."reward_type" IN ('hourly','per_post','flat'));--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD CONSTRAINT "collaborator_work_entries_rate_consistent" CHECK (("collaborator_work_entries"."reward_type" = 'flat') = ("collaborator_work_entries"."rate_kc" IS NULL));--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD CONSTRAINT "collaborator_work_entries_rate_positive" CHECK ("collaborator_work_entries"."rate_kc" IS NULL OR "collaborator_work_entries"."rate_kc" > 0);--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD CONSTRAINT "collaborator_work_entries_deleted_consistent" CHECK (("collaborator_work_entries"."deleted_at" IS NULL) = ("collaborator_work_entries"."deleted_by" IS NULL));
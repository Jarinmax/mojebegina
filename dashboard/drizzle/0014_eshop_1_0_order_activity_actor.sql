ALTER TABLE "order_activity" ALTER COLUMN "author_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_activity" ADD COLUMN "actor_type" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_activity" ADD CONSTRAINT "order_activity_actor_type_check" CHECK ("order_activity"."actor_type" IN ('user', 'system', 'customer'));--> statement-breakpoint
ALTER TABLE "order_activity" ADD CONSTRAINT "order_activity_user_has_author" CHECK ("order_activity"."actor_type" <> 'user' OR "order_activity"."author_user_id" IS NOT NULL);
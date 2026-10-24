CREATE TABLE "customer_card_preview_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viewer_user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"permission" text NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	CONSTRAINT "user_permissions_permission_check" CHECK ("user_permissions"."permission" IN ('customer_card_preview')),
	CONSTRAINT "user_permissions_revoked_by" CHECK (("user_permissions"."revoked_at" IS NULL) = ("user_permissions"."revoked_by_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "customer_card_preview_log" ADD CONSTRAINT "customer_card_preview_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_card_preview_log_org_idx" ON "customer_card_preview_log" USING btree ("organization_id","opened_at");--> statement-breakpoint
CREATE INDEX "customer_card_preview_log_viewer_idx" ON "customer_card_preview_log" USING btree ("viewer_user_id","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permissions_one_active" ON "user_permissions" USING btree ("user_id","permission") WHERE "user_permissions"."revoked_at" IS NULL;
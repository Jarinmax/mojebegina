CREATE TABLE "seller_reward_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"seller_user_id" text NOT NULL,
	"reward_type" text NOT NULL,
	"basis" text DEFAULT 'contract' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"upsell_product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	CONSTRAINT "seller_reward_assignments_type_check" CHECK ("seller_reward_assignments"."reward_type" IN ('new', 'renewed', 'upsell')),
	CONSTRAINT "seller_reward_assignments_basis_check" CHECK ("seller_reward_assignments"."basis" IN ('contract', 'confirmed_at_signing')),
	CONSTRAINT "seller_reward_assignments_upsell_products" CHECK (("seller_reward_assignments"."reward_type" = 'upsell') = (cardinality("seller_reward_assignments"."upsell_product_ids") > 0))
);
--> statement-breakpoint
ALTER TABLE "seller_reward_assignments" ADD CONSTRAINT "seller_reward_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_reward_assignments_one_active" ON "seller_reward_assignments" USING btree ("lead_id") WHERE "seller_reward_assignments"."cancelled_at" IS NULL;
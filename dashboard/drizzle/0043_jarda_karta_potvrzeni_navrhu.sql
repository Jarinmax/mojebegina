ALTER TABLE "seller_reward_assignments" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seller_reward_assignments" ADD COLUMN "confirmed_by" text;--> statement-breakpoint
ALTER TABLE "seller_reward_assignments" ADD CONSTRAINT "seller_reward_assignments_confirmed_pair" CHECK (("seller_reward_assignments"."confirmed_at" IS NULL) = ("seller_reward_assignments"."confirmed_by" IS NULL));--> statement-breakpoint
-- Dosavadní zápisy vedení (potvrzené při podpisu dohody, nebo zapsané někým jiným než prodejcem) jsou potvrzené; zápis prodejce zůstává návrhem.
UPDATE "seller_reward_assignments" SET "confirmed_at" = "recorded_at", "confirmed_by" = "recorded_by" WHERE "confirmed_at" IS NULL AND ("basis" = 'confirmed_at_signing' OR "recorded_by" <> "seller_user_id");

CREATE TABLE "recipe_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid,
	"item_name" text NOT NULL,
	"url" text,
	"pack_label" text NOT NULL,
	"pack_qty" numeric(12, 4) NOT NULL,
	"price_kc" numeric(12, 2) NOT NULL,
	"shipping_kc" numeric(12, 2) DEFAULT '0' NOT NULL,
	"is_promo" boolean DEFAULT false NOT NULL,
	"note" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_offers_pack_check" CHECK ("recipe_offers"."pack_qty" > 0),
	CONSTRAINT "recipe_offers_price_check" CHECK ("recipe_offers"."price_kc" >= 0 AND "recipe_offers"."shipping_kc" >= 0)
);
--> statement-breakpoint
ALTER TABLE "recipe_offers" ADD CONSTRAINT "recipe_offers_ingredient_id_recipe_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."recipe_ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_offers_ingredient_idx" ON "recipe_offers" USING btree ("ingredient_id");
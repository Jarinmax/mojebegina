CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_unit" text NOT NULL,
	"price_kc" numeric(12, 4) NOT NULL,
	"note" text,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_ingredients_code_key" UNIQUE("code"),
	CONSTRAINT "recipe_ingredients_kind_check" CHECK ("recipe_ingredients"."kind" IN ('surovina','obal')),
	CONSTRAINT "recipe_ingredients_unit_check" CHECK ("recipe_ingredients"."price_unit" IN ('kg','l','ks','kapka')),
	CONSTRAINT "recipe_ingredients_price_check" CHECK ("recipe_ingredients"."price_kc" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recipe_items_unit_check" CHECK ("recipe_items"."unit" IN ('g','ml','l','kapka','ks'))
);
--> statement-breakpoint
CREATE TABLE "recipe_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"label" text NOT NULL,
	"volume_ml" integer NOT NULL,
	"packaging_codes" text NOT NULL,
	"sale_price_hal" integer,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"batch_ml" integer NOT NULL,
	"note" text,
	"archived" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recipes_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_recipe_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."recipe_ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_variants" ADD CONSTRAINT "recipe_variants_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_items_recipe_idx" ON "recipe_items" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_variants_recipe_idx" ON "recipe_variants" USING btree ("recipe_id");
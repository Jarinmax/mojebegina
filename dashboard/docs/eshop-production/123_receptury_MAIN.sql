-- 123: Receptury a náklady – čtyři NOVÉ tabulky (recipes, recipe_ingredients, recipe_items, recipe_variants).
-- Nic existujícího se nemění. Stejné DDL jako drizzle/0046_receptury.sql. Dá se spustit opakovaně:
-- když tabulky už existují, skript neudělá nic.
-- Samotné receptury (množství surovin) jsou výrobní tajemství a v repozitáři NEJSOU;
-- do databáze je nahrála plná verze tohoto skriptu, kterou dostala Lucie.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
DO $$ BEGIN
IF to_regclass('public.recipes') IS NULL THEN
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

  CREATE TABLE "recipe_items" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"recipe_id" uuid NOT NULL,
  	"ingredient_id" uuid NOT NULL,
  	"quantity" numeric(12, 3) NOT NULL,
  	"unit" text NOT NULL,
  	"sort" integer DEFAULT 0 NOT NULL,
  	CONSTRAINT "recipe_items_unit_check" CHECK ("recipe_items"."unit" IN ('g','ml','l','kapka','ks'))
  );

  CREATE TABLE "recipe_variants" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"recipe_id" uuid NOT NULL,
  	"label" text NOT NULL,
  	"volume_ml" integer NOT NULL,
  	"packaging_codes" text NOT NULL,
  	"sale_price_hal" integer,
  	"sort" integer DEFAULT 0 NOT NULL
  );

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

  ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_recipe_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."recipe_ingredients"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "recipe_variants" ADD CONSTRAINT "recipe_variants_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "recipe_items_recipe_idx" ON "recipe_items" USING btree ("recipe_id");
  CREATE INDEX "recipe_variants_recipe_idx" ON "recipe_variants" USING btree ("recipe_id");
END IF;
END $$;
COMMIT;
SELECT (SELECT count(*) FROM recipes) AS receptur, (SELECT count(*) FROM recipe_items) AS polozek, (SELECT count(*) FROM recipe_ingredients) AS cenik, (SELECT count(*) FROM recipe_variants) AS baleni;

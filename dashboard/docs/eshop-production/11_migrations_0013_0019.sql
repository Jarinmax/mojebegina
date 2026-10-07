-- PRODUCTION — e-shopové migrace 0013–0019 (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs).
-- Obsah = přesně soubory drizzle/0013–0019, stejné jako na Preview. Spouštět CELÉ najednou
-- v Neon SQL Editoru na větvi production (main), až po kontrole 10_before_migrations.sql.
-- Neon SQL Editor spouští celý vstup v jedné transakci: chyba = nic se nezmění.

BEGIN;

-- ===== 0013_eshop_1_0_products.sql =====
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"intro" text[] DEFAULT '{}'::text[] NOT NULL,
	"detail_sections" jsonb,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_categories_slug_format" CHECK ("product_categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"url" text NOT NULL,
	"alt" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"label" text,
	"short_note" text,
	"package_description" text,
	"volume_ml" integer,
	"servings" integer,
	"price_b2c_kc" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "product_variants_sku_format" CHECK ("product_variants"."sku" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "product_variants_volume_positive" CHECK ("product_variants"."volume_ml" > 0),
	CONSTRAINT "product_variants_servings_positive" CHECK ("product_variants"."servings" > 0),
	CONSTRAINT "product_variants_price_nonnegative" CHECK ("product_variants"."price_b2c_kc" >= 0)
);

CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_description" text,
	"description" text[] DEFAULT '{}'::text[] NOT NULL,
	"highlights" text[] DEFAULT '{}'::text[] NOT NULL,
	"taste_description" text,
	"ingredients" text,
	"allergens" text[],
	"allergen_note" text,
	"nutrition" jsonb,
	"nutrition_basis" text,
	"storage_instructions" text,
	"shelf_life_days" integer,
	"shelf_life_note" text,
	"alcohol_percent" numeric(4, 1),
	"is_age_restricted" boolean DEFAULT false NOT NULL,
	"warnings" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "products_allergens_known" CHECK ("products"."allergens" <@ ARRAY['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs']::text[]),
	CONSTRAINT "products_nutrition_basis_check" CHECK ("products"."nutrition_basis" IN ('100g', '100ml')),
	CONSTRAINT "products_shelf_life_positive" CHECK ("products"."shelf_life_days" > 0),
	CONSTRAINT "products_alcohol_range" CHECK ("products"."alcohol_percent" BETWEEN 0 AND 100),
	CONSTRAINT "products_alcohol_requires_age_restriction" CHECK ("products"."alcohol_percent" IS NULL OR "products"."alcohol_percent" <= 0.5 OR "products"."is_age_restricted")
);

ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id","sort_order");
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id","sort_order");
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id","sort_order");

-- ===== 0014_eshop_1_0_products_seed.sql =====
-- ESHOP 1.0 — první naplnění katalogu. VYGENEROVÁNO z lib/eshop/catalog.ts
-- skriptem scripts/eshop-seed/generate-seed-sql.ts — ručně neupravovat.
-- 5 kategorií, 7 produktů, 11 balení (SKU), 4 fotek.
-- Idempotentní (ON CONFLICT / WHERE NOT EXISTS).
INSERT INTO "product_categories" ("slug", "name", "intro", "detail_sections", "image_url", "sort_order")
VALUES ('polevky', 'Čerstvé polévky', '{}'::text[], NULL, '/eshop/kategorie-polevky.jpg', 10)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "intro" = EXCLUDED."intro",
  "detail_sections" = EXCLUDED."detail_sections", "image_url" = EXCLUDED."image_url",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_categories" ("slug", "name", "intro", "detail_sections", "image_url", "sort_order")
VALUES ('sirupy', 'Bylinné sirupy', '{}'::text[], NULL, '/eshop/kategorie-sirupy.jpg', 20)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "intro" = EXCLUDED."intro",
  "detail_sections" = EXCLUDED."detail_sections", "image_url" = EXCLUDED."image_url",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_categories" ("slug", "name", "intro", "detail_sections", "image_url", "sort_order")
VALUES ('caje', 'Čaje', '{}'::text[], NULL, '/eshop/kategorie-caje.jpg', 30)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "intro" = EXCLUDED."intro",
  "detail_sections" = EXCLUDED."detail_sections", "image_url" = EXCLUDED."image_url",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_categories" ("slug", "name", "intro", "detail_sections", "image_url", "sort_order")
VALUES ('ovocne-napoje', 'Ovocné nápoje', '{}'::text[], NULL, '/eshop/kategorie-ovocne-napoje.jpg', 40)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "intro" = EXCLUDED."intro",
  "detail_sections" = EXCLUDED."detail_sections", "image_url" = EXCLUDED."image_url",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_categories" ("slug", "name", "intro", "detail_sections", "image_url", "sort_order")
VALUES ('koktejly', 'Alkoholické koktejly', ARRAY['Alkoholické koktejly Begina spojují kvalitní destiláty, čisté ovocné šťávy a precizně vyvážené chutě.', 'Každý nápoj je postavený tak, aby působil přirozeně, čistě a zároveň výrazně.']::text[], '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Alkoholické koktejly Begina jsou praktické řešení pro:","Díky bag-in-box balení lze koktejl jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, '/eshop/kategorie-koktejly.jpg', 50)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "intro" = EXCLUDED."intro",
  "detail_sections" = EXCLUDED."detail_sections", "image_url" = EXCLUDED."image_url",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "storage_instructions", "shelf_life_note", "alcohol_percent",
  "is_age_restricted", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'dynova-polevka', 'Dýňová polévka',
  'Krémová polévka z dýně.', '{}'::text[], '{}'::text[], NULL,
  NULL, NULL, NULL, NULL,
  false, '{}'::text[], 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "storage_instructions" = EXCLUDED."storage_instructions",
  "shelf_life_note" = EXCLUDED."shelf_life_note", "alcohol_percent" = EXCLUDED."alcohol_percent",
  "is_age_restricted" = EXCLUDED."is_age_restricted", "warnings" = EXCLUDED."warnings",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "storage_instructions", "shelf_life_note", "alcohol_percent",
  "is_age_restricted", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'kulajda', 'Kulajda',
  'Tradiční jihočeská polévka.', '{}'::text[], '{}'::text[], NULL,
  NULL, NULL, NULL, NULL,
  false, '{}'::text[], 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "storage_instructions" = EXCLUDED."storage_instructions",
  "shelf_life_note" = EXCLUDED."shelf_life_note", "alcohol_percent" = EXCLUDED."alcohol_percent",
  "is_age_restricted" = EXCLUDED."is_age_restricted", "warnings" = EXCLUDED."warnings",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "storage_instructions", "shelf_life_note", "alcohol_percent",
  "is_age_restricted", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'rajcatova-polevka', 'Rajčatová polévka',
  'Polévka z rajčat.', '{}'::text[], '{}'::text[], NULL,
  NULL, NULL, NULL, NULL,
  false, '{}'::text[], 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "storage_instructions" = EXCLUDED."storage_instructions",
  "shelf_life_note" = EXCLUDED."shelf_life_note", "alcohol_percent" = EXCLUDED."alcohol_percent",
  "is_age_restricted" = EXCLUDED."is_age_restricted", "warnings" = EXCLUDED."warnings",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "storage_instructions", "shelf_life_note", "alcohol_percent",
  "is_age_restricted", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'koktejly'), 'svarak-deluxe', 'Svařák Deluxe',
  'Výrazný zahřívací nápoj z červeného vína s ovocem a kořením.', ARRAY['Svařák Deluxe je výrazný zahřívací nápoj, ve kterém se propojuje kvalitní červené víno s ovocnými tóny pomeranče, grepu a citronu. Koření jako skořice, hřebíček, badyán, kardamom, zázvor a vanilka dotváří jeho charakter a přináší bohatý chuťový zážitek.', 'Každý doušek působí příjemným a hřejivým dojmem a přirozeně zapadá do zimní atmosféry i večerní pohody.', 'Prémiový nápoj, který máte v lednici vždy připravený. Stačí ohřát. Výborný i chlazený s ledem.']::text[], ARRAY['bez umělých aromat a barviv', 'plná, vyvážená chuť', 'stačí jemně ohřát']::text[], 'Plná a vyvážená chuť červeného vína s jemnými tóny pomeranče, grepu a citronu, doplněná hřejivým kořením, které vytváří bohatý a harmonický chuťový zážitek.',
  'červené víno, pomerančová šťáva, grepová šťáva, citronová šťáva, třtinový cukr, skořice, zázvor, kardamom, hřebíček, badyán, vanilka, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.', NULL, 7.5,
  true, ARRAY['Není určeno pro děti, těhotné a kojící ženy.']::text[], 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "storage_instructions" = EXCLUDED."storage_instructions",
  "shelf_life_note" = EXCLUDED."shelf_life_note", "alcohol_percent" = EXCLUDED."alcohol_percent",
  "is_age_restricted" = EXCLUDED."is_age_restricted", "warnings" = EXCLUDED."warnings",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "storage_instructions", "shelf_life_note", "alcohol_percent",
  "is_age_restricted", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'koktejly'), 'lady-carneval', 'Lady Carneval',
  'Grepový koktejl s vodkou a Aperolem.', ARRAY['Grepový alkoholický koktejl Lady Carneval v sobě spojuje kvalitní vodku, italský Aperol a grepovou šťávu. Vzniká tak harmonický drink s výrazným citrusovým charakterem.', 'Každý doušek přináší osvěžující chuťový zážitek, který se hodí pro chvíle s přáteli i jako stylové osvěžení pro každou příležitost.', 'Prémiový nápoj, který máte v lednici vždy připravený. Stačí nalít do sklenice s ledem.', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'ideální pro podávání s ledem', 'plná, osvěžující chuť']::text[], 'Grepový alkoholický koktejl Lady Carneval má výraznou citrusovou chuť s příjemnou svěžestí grepu a jemně nasládlým dozvukem. Vyvážené spojení vodky, Aperolu a ovocných tónů vytváří harmonický a osvěžující drink, který působí lehce a elegantně.',
  'čistá filtrovaná voda, vodka, grepová šťáva, Aperol (pitná voda, cukr, líh, aromata, barviva: E110, E124), citronová šťáva, třtinový cukr, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.', NULL, 7.2,
  true, ARRAY['Není určeno pro děti, těhotné a kojící ženy.']::text[], 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "storage_instructions" = EXCLUDED."storage_instructions",
  "shelf_life_note" = EXCLUDED."shelf_life_note", "alcohol_percent" = EXCLUDED."alcohol_percent",
  "is_age_restricted" = EXCLUDED."is_age_restricted", "warnings" = EXCLUDED."warnings",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "storage_instructions", "shelf_life_note", "alcohol_percent",
  "is_age_restricted", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'koktejly'), 'granatovy-bond', 'Granátový Bond',
  'Ovocný koktejl s vodkou a granátovým jablkem.', '{}'::text[], '{}'::text[], 'Granátový Bond má plnou, ovocnou chuť s výrazným tónem granátového jablka, který se postupně rozvíjí do jemně nasládlého a hladkého závěru. Jako alkoholický koktejl s granátovým jablkem působí elegantně, intenzivně a zanechává dlouhý, příjemný dozvuk.',
  'čistá filtrovaná voda, vodka, šťáva z granátového jablka, třtinový cukr, citronová šťáva, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.', NULL, 6.7,
  true, ARRAY['Není určeno pro děti, těhotné a kojící ženy.']::text[], 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "storage_instructions" = EXCLUDED."storage_instructions",
  "shelf_life_note" = EXCLUDED."shelf_life_note", "alcohol_percent" = EXCLUDED."alcohol_percent",
  "is_age_restricted" = EXCLUDED."is_age_restricted", "warnings" = EXCLUDED."warnings",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "storage_instructions", "shelf_life_note", "alcohol_percent",
  "is_age_restricted", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'koktejly'), 'kosmopolitan', 'Kosmopolitan',
  'Brusinkový koktejl s vodkou a citrusy.', ARRAY['Kosmopolitan je ikonický alkoholický koktejl, který spojuje kvalitní vodku, brusinkovou a citronovou šťávu. Vzniká tak harmonický drink s výrazným ovocně-citrusovým charakterem a jemně nasládlým dozvukem.', 'Každý doušek přináší osvěžující chuťový zážitek, který se hodí pro chvíle s přáteli i jako stylové osvěžení pro každou příležitost.', 'Prémiový nápoj, který máte v lednici vždy připravený. Stačí nalít do sklenice s ledem.', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'ideální pro podávání s ledem', 'bez umělých aromat a barviv', 'plná, osvěžující chuť']::text[], 'Kosmopolitan má výraznou ovocně-citrusovou chuť se svěžestí brusinek a jemně nasládlým dozvukem. Působí lehce, elegantně a dodává každému okamžiku nádech sebevědomí a stylu.',
  'čistá filtrovaná voda, brusinková šťáva, jablečná šťáva, vodka, citronová šťáva, třtinový cukr, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.', NULL, 6.3,
  true, ARRAY['Není určeno pro děti, těhotné a kojící ženy.']::text[], 40)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "storage_instructions" = EXCLUDED."storage_instructions",
  "shelf_life_note" = EXCLUDED."shelf_life_note", "alcohol_percent" = EXCLUDED."alcohol_percent",
  "is_age_restricted" = EXCLUDED."is_age_restricted", "warnings" = EXCLUDED."warnings",
  "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka'), 'dynova-polevka', NULL, NULL,
  NULL, NULL, NULL, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'kulajda'), 'kulajda', NULL, NULL,
  NULL, NULL, NULL, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka'), 'rajcatova-polevka', NULL, NULL,
  NULL, NULL, NULL, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'svarak-deluxe'), 'svarak-deluxe-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 15 nápojů po 200 ml',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 15, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'svarak-deluxe'), 'svarak-deluxe-500ml', '500 ml Praktické balení', '2–3 nápoje',
  'Lehké a nerozbitné balení vhodné na cesty nebo pro menší spotřebu.', 500, NULL, 129, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'lady-carneval'), 'lady-carneval-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 15 nápojů po 200 ml',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 15, 799, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'lady-carneval'), 'lady-carneval-500ml', '500 ml Praktické balení', '2–3 nápoje',
  'Lehké a nerozbitné balení vhodné na cesty nebo pro menší spotřebu.', 500, NULL, 169, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'granatovy-bond'), 'granatovy-bond-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 15 nápojů po 200 ml',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 15, 799, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'granatovy-bond'), 'granatovy-bond-500ml', '500 ml Praktické balení', '2–3 nápoje',
  'Lehké a nerozbitné balení vhodné na cesty nebo pro menší spotřebu.', 500, NULL, 169, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'kosmopolitan'), 'kosmopolitan-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 15 nápojů po 200 ml',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 15, 799, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'kosmopolitan'), 'kosmopolitan-500ml', '500 ml Praktické balení', '2–3 nápoje',
  'Lehké a nerozbitné balení vhodné na cesty nebo pro menší spotřebu.', 500, NULL, 169, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/svarak-deluxe.jpg', 'Svařák Deluxe', 0 FROM "products" WHERE "slug" = 'svarak-deluxe'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'svarak-deluxe' AND pi."url" = '/eshop/svarak-deluxe.jpg');

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/lady-carneval.jpg', 'Lady Carneval', 0 FROM "products" WHERE "slug" = 'lady-carneval'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'lady-carneval' AND pi."url" = '/eshop/lady-carneval.jpg');

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/granatovy-bond.jpg', 'Granátový Bond', 0 FROM "products" WHERE "slug" = 'granatovy-bond'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'granatovy-bond' AND pi."url" = '/eshop/granatovy-bond.jpg');

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/kosmopolitan.jpg', 'Kosmopolitan', 0 FROM "products" WHERE "slug" = 'kosmopolitan'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'kosmopolitan' AND pi."url" = '/eshop/kosmopolitan.jpg');

-- ===== 0015_eshop_1_0_order_activity_actor.sql =====
ALTER TABLE "order_activity" ALTER COLUMN "author_user_id" DROP NOT NULL;
ALTER TABLE "order_activity" ADD COLUMN "actor_type" text DEFAULT 'user' NOT NULL;
ALTER TABLE "order_activity" ADD CONSTRAINT "order_activity_actor_type_check" CHECK ("order_activity"."actor_type" IN ('user', 'system', 'customer'));
ALTER TABLE "order_activity" ADD CONSTRAINT "order_activity_user_has_author" CHECK ("order_activity"."actor_type" <> 'user' OR "order_activity"."author_user_id" IS NOT NULL);

-- ===== 0016_eshop_1_0_orders_fields.sql =====
ALTER TABLE "orders" ADD COLUMN "channel" text DEFAULT 'manual' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "customer_note" text;
ALTER TABLE "orders" ADD COLUMN "shipping_method_code" text;
ALTER TABLE "orders" ADD COLUMN "shipping_method_label" text;
ALTER TABLE "orders" ADD COLUMN "payment_method_code" text;
ALTER TABLE "orders" ADD COLUMN "payment_method_label" text;
ALTER TABLE "orders" ADD COLUMN "discount_kc" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN "age_confirmed_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "terms_accepted_at" timestamp with time zone;
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_check" CHECK ("orders"."channel" IN ('manual', 'eshop', 'import'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_nonnegative" CHECK ("orders"."discount_kc" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_consistent" CHECK ("orders"."total_kc" = "orders"."subtotal_kc" - "orders"."discount_kc" + "orders"."shipping_kc");
-- Ručně doplněno: dvě objednávky The Cup nahrané importem 18. 9. 2026
-- (entered_by_user_id IS NULL, ověřeno 27. 9. 2026). Explicitně podle id,
-- ne heuristikou; v DB bez těchto objednávek nic nezmění.
UPDATE "orders" SET "channel" = 'import'
WHERE "id" IN ('329f54d5-5a7d-4522-a21e-b7ad9cde24e2', '984e3645-1f2f-4444-8e8e-eeac75165a0a');

-- ===== 0017_eshop_1_0_order_items_variant.sql =====
ALTER TABLE "order_items" ADD COLUMN "product_variant_id" uuid;
ALTER TABLE "order_items" ADD COLUMN "sku_snapshot" text;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "order_items_product_variant_idx" ON "order_items" USING btree ("product_variant_id");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_consistent" CHECK ("order_items"."line_total_kc" = "order_items"."quantity" * "order_items"."unit_price_kc");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_has_sku" CHECK ("order_items"."product_variant_id" IS NULL OR "order_items"."sku_snapshot" IS NOT NULL);

-- ===== 0018_eshop_1_0_order_number.sql =====
ALTER TABLE "orders" ADD COLUMN "order_number" bigint;
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders" USING btree ("order_number");

-- ===== 0019_eshop_1_0_orders_guest.sql =====
ALTER TABLE "orders" ALTER COLUMN "buyer_organization_id" DROP NOT NULL;
ALTER TABLE "orders" ADD CONSTRAINT "orders_manual_requires_org" CHECK ("orders"."channel" <> 'manual' OR "orders"."buyer_organization_id" IS NOT NULL);
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_requires_contact" CHECK ("orders"."buyer_organization_id" IS NOT NULL OR "orders"."contact_email" IS NOT NULL);

COMMIT;

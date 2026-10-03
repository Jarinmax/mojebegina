-- ESHOP 1.0 — vrácení 41_polevky.sql: polévky Dýňová polévka, Gulášová polévka z hlívy ústřičné
-- zpět do stavu z migrace 0014 (krátký popis, balení bez názvu, cena), bez
-- nových textů, výživy a fotky; nově přidané polévky se skryjí; společná
-- sekce kategorie se odebere. Nic
-- jiného se nemaže, objednávky zůstávají v pořádku. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-polevky.mjs. Opětovné spuštění 41 vše vrátí.
BEGIN;
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

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka'), 'dynova-polevka', NULL, NULL,
  NULL, NULL, NULL, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

UPDATE "products" SET "nutrition" = NULL, "nutrition_basis" = NULL, "updated_at" = now()
WHERE "slug" IN ('dynova-polevka', 'gulasova-polevka-z-hlivy-ustricne');

DELETE FROM "product_images" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" IN ('dynova-polevka', 'gulasova-polevka-z-hlivy-ustricne'))
  AND "url" IN ('/eshop/dynova-polevka.jpg', '/eshop/gulasova-polevka-z-hlivy-ustricne.jpg');

-- Polévky, které v migraci 0014 nejsou: jen skrýt (objednávky zůstanou v pořádku).
UPDATE "product_variants" SET "is_active" = false, "updated_at" = now()
WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" IN ('gulasova-polevka-z-hlivy-ustricne'));
UPDATE "products" SET "is_active" = false, "updated_at" = now() WHERE "slug" IN ('gulasova-polevka-z-hlivy-ustricne');

UPDATE "product_categories" SET "detail_sections" = NULL, "updated_at" = now() WHERE "slug" = 'polevky';
COMMIT;

-- ESHOP 1.0 — vrácení 31_sirupy.sql: sirupy z e-shopu zmizí (is_active =
-- false), text a sekce kategorie se vyprázdní. Nic se nemaže — objednávky, které
-- už sirupy obsahují, zůstanou v pořádku. Opětovné spuštění 31 je vrátí.
BEGIN;
UPDATE "product_variants" SET "is_active" = false, "updated_at" = now()
WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli'));
UPDATE "products" SET "is_active" = false, "updated_at" = now() WHERE "slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli');
UPDATE "product_categories" SET "intro" = '{}'::text[], "detail_sections" = NULL, "updated_at" = now() WHERE "slug" = 'sirupy';
COMMIT;

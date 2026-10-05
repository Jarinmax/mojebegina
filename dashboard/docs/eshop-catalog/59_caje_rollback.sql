-- ESHOP 1.0 — vrácení 51_caje.sql: čaje Bylinný čaj Šaman, Zázvorový čaj, Lipový čaj, Heřmánkový čaj, Černý čaj Golden Nepal, Jasmínový zelený čaj, Ibiškový čaj, Meduňkový čaj s levandulí z e-shopu
-- zmizí (is_active = false), společná sekce kategorie se odebere. Nic se
-- nemaže — objednávky, které čaje obsahují, zůstanou v pořádku.
-- VYGENEROVÁNO skriptem scripts/eshop-catalog/build-caje.mjs. Opětovné
-- spuštění 51 vše vrátí.
BEGIN;
UPDATE "product_variants" SET "is_active" = false, "updated_at" = now()
WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" IN ('bylinny-caj-saman', 'zazvorovy-caj', 'lipovy-caj', 'hermankovy-caj', 'cerny-caj-golden-nepal', 'jasminovy-zeleny-caj', 'ibiskovy-caj', 'medunkovy-caj-s-levanduli'));
UPDATE "products" SET "is_active" = false, "updated_at" = now() WHERE "slug" IN ('bylinny-caj-saman', 'zazvorovy-caj', 'lipovy-caj', 'hermankovy-caj', 'cerny-caj-golden-nepal', 'jasminovy-zeleny-caj', 'ibiskovy-caj', 'medunkovy-caj-s-levanduli');
UPDATE "product_categories" SET "intro" = '{}'::text[], "detail_sections" = NULL, "updated_at" = now() WHERE "slug" = 'caje';
COMMIT;

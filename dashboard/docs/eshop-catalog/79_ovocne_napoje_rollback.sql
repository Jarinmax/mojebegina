-- ESHOP — vrácení 71/73: Ovocné nápoje zmizí z e-shopu (is_active = false),
-- text kategorie se odebere. Nic se nemaže. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-ovocne-napoje.mjs.
BEGIN;
UPDATE "products" SET "is_active" = false, "updated_at" = now() WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko');
UPDATE "product_categories" SET "intro" = '{}'::text[], "detail_sections" = NULL, "updated_at" = now() WHERE "slug" = 'ovocne-napoje';
COMMIT;

-- ESHOP — kontrola PO 71_ovocne_napoje.sql (jen čtení).
-- Očekáváno (produkty založené, ale SKRYTÉ a s neověřenými alergeny):
--   napoje_celkem | napoje_v_prodeji | neoverene_alergeny | baleni_cervankove_nebe                  | svarak            | fotky
--   3             | 0                | 3                  | 3 l Rodinná zásoba (bag-in-box), 349 Kč | 399 Kč, 15 nápojů | 3
SELECT
  (SELECT count(*) FROM "products" WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko')) AS napoje_celkem,
  (SELECT count(*) FROM "products" WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko') AND "is_active") AS napoje_v_prodeji,
  (SELECT count(*) FROM "products" WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko') AND "allergens" IS NULL) AS neoverene_alergeny,
  (SELECT v."label" || ', ' || v."price_b2c_kc" || ' Kč' FROM "product_variants" v WHERE v."sku" = 'cervankove-nebe-3l') AS baleni_cervankove_nebe,
  (SELECT v."price_b2c_kc" || ' Kč, ' || v."servings" || ' nápojů' FROM "product_variants" v WHERE v."sku" = 'malinovy-svarak-nealko-3l') AS svarak,
  (SELECT count(*) FROM "product_images" i JOIN "products" p ON p."id" = i."product_id" WHERE p."slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko')) AS fotky;

-- ESHOP 1.0 — kontrola PO 51_caje.sql (jen čtení).
-- Očekáváno:
--   caje_v_prodeji | sekce_kategorie | saman_baleni                           | fotky_caju | zazvorovy
--   3              | 1               | 3 l Rodinná zásoba (bag-in-box), 289 Kč | 2          | 249 Kč, 12 nápojů
SELECT
  (SELECT count(*) FROM "products" p JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'caje' AND p."is_active") AS caje_v_prodeji,
  (SELECT coalesce(jsonb_array_length("detail_sections"), 0) FROM "product_categories" WHERE "slug" = 'caje') AS sekce_kategorie,
  (SELECT v."label" || ', ' || v."price_b2c_kc" || ' Kč' FROM "product_variants" v WHERE v."sku" = 'bylinny-caj-saman-3l' AND v."is_active") AS saman_baleni,
  (SELECT count(*) FROM "product_images" i JOIN "products" p ON p."id" = i."product_id" JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'caje') AS fotky_caju,
  (SELECT v."price_b2c_kc" || ' Kč, ' || v."servings" || ' nápojů' FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id" WHERE p."slug" = 'zazvorovy-caj' AND p."is_active" AND v."is_active") AS zazvorovy;

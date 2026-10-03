-- ESHOP 1.0 — kontrola PO 41_polevky.sql (jen čtení).
-- Očekáváno:
--   polevky | sekce_kategorie | dynova_slozeni | dynova_baleni                   | dynova_cena | dynova_porci | fotky_polevek | dynova_baleni_pocet | gulasova         | spenatova
--   6       | 1               | ano            | 3 l Rodinná zásoba (bag-in-box) | 379         | 12           | 4             | 1                   | 379 Kč, 12 porcí | 379 Kč, 12 porcí
SELECT
  (SELECT count(*) FROM "products" p JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'polevky' AND p."is_active") AS polevky,
  (SELECT coalesce(jsonb_array_length("detail_sections"), 0) FROM "product_categories" WHERE "slug" = 'polevky') AS sekce_kategorie,
  (SELECT CASE WHEN "ingredients" IS NOT NULL THEN 'ano' ELSE 'ne' END FROM "products" WHERE "slug" = 'dynova-polevka') AS dynova_slozeni,
  (SELECT "label" FROM "product_variants" WHERE "sku" = 'dynova-polevka') AS dynova_baleni,
  (SELECT "price_b2c_kc" FROM "product_variants" WHERE "sku" = 'dynova-polevka') AS dynova_cena,
  (SELECT "servings" FROM "product_variants" WHERE "sku" = 'dynova-polevka') AS dynova_porci,
  (SELECT count(*) FROM "product_images" i JOIN "products" p ON p."id" = i."product_id" JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'polevky') AS fotky_polevek,
  (SELECT count(*) FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id" WHERE p."slug" = 'dynova-polevka') AS dynova_baleni_pocet,
  (SELECT v."price_b2c_kc" || ' Kč, ' || v."servings" || ' porcí' FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id" WHERE p."slug" = 'gulasova-polevka-z-hlivy-ustricne' AND p."is_active" AND v."is_active") AS gulasova,
  (SELECT v."price_b2c_kc" || ' Kč, ' || v."servings" || ' porcí' FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id" WHERE p."slug" = 'spenatova-polevka' AND p."is_active" AND v."is_active") AS spenatova;

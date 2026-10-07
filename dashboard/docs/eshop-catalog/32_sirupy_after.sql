-- ESHOP 1.0 — kontrola PO 31_sirupy.sql (jen čtení).
-- Očekáváno:
--   text_kategorie | sirupy | aktivni | baleni | fotky | za_199 | za_499 | za_549 | produkty | baleni_celkem
--   3              | 7      | 7       | 14     | 7     | 7      | 3      | 4      | 14       | 25
SELECT
  (SELECT cardinality("intro") FROM "product_categories" WHERE "slug" = 'sirupy') AS text_kategorie,
  (SELECT count(*) FROM "products" p JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'sirupy') AS sirupy,
  (SELECT count(*) FROM "products" p JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'sirupy' AND p."is_active") AS aktivni,
  (SELECT count(*) FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id" WHERE p."slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli')) AS baleni,
  (SELECT count(*) FROM "product_images" i JOIN "products" p ON p."id" = i."product_id" WHERE p."slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli')) AS fotky,
  (SELECT count(*) FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id" WHERE p."slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli') AND v."price_b2c_kc" = 199) AS za_199,
  (SELECT count(*) FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id" WHERE p."slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli') AND v."price_b2c_kc" = 499) AS za_499,
  (SELECT count(*) FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id" WHERE p."slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli') AND v."price_b2c_kc" = 549) AS za_549,
  (SELECT count(*) FROM "products") AS produkty,
  (SELECT count(*) FROM "product_variants") AS baleni_celkem;

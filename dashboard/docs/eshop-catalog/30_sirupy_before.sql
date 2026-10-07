-- ESHOP 1.0 — kontrola PŘED 31_sirupy.sql (jen čtení).
-- Očekáváno na Preview i Production (po migracích 0013–0019):
--   kategorie_sirupy | text_kategorie | sirupy | baleni | fotky | produkty | baleni_celkem
--   1                | 0              | 0      | 0      | 0     | 7        | 11
-- (text_kategorie = 3 znamená, že skript už běžel — spustit znovu je bezpečné.)
SELECT
  (SELECT count(*) FROM "product_categories" WHERE "slug" = 'sirupy') AS kategorie_sirupy,
  (SELECT cardinality("intro") FROM "product_categories" WHERE "slug" = 'sirupy') AS text_kategorie,
  (SELECT count(*) FROM "products" WHERE "slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli')) AS sirupy,
  (SELECT count(*) FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id" WHERE p."slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli')) AS baleni,
  (SELECT count(*) FROM "product_images" i JOIN "products" p ON p."id" = i."product_id" WHERE p."slug" IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli')) AS fotky,
  (SELECT count(*) FROM "products") AS produkty,
  (SELECT count(*) FROM "product_variants") AS baleni_celkem;

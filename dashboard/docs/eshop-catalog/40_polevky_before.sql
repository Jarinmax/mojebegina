-- ESHOP 1.0 — kontrola PŘED 41_polevky.sql (jen čtení).
-- Očekáváno (polévky v prodeji ze základního katalogu, migrace 0014):
--   polevky | sekce_kategorie | dynova_popis            | dynova_baleni | dynova_cena | fotky_polevek
--   3       | 0               | Krémová polévka z dýně. | (bez názvu)   | 379         | 0
-- (sekce_kategorie = 1 a vyplněné balení znamená, že skript už běžel —
-- spustit znovu je bezpečné.)
SELECT
  (SELECT count(*) FROM "products" p JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'polevky' AND p."is_active") AS polevky,
  (SELECT coalesce(jsonb_array_length("detail_sections"), 0) FROM "product_categories" WHERE "slug" = 'polevky') AS sekce_kategorie,
  (SELECT "short_description" FROM "products" WHERE "slug" = 'dynova-polevka') AS dynova_popis,
  (SELECT coalesce("label", '(bez názvu)') FROM "product_variants" WHERE "sku" = 'dynova-polevka') AS dynova_baleni,
  (SELECT "price_b2c_kc" FROM "product_variants" WHERE "sku" = 'dynova-polevka') AS dynova_cena,
  (SELECT count(*) FROM "product_images" i JOIN "products" p ON p."id" = i."product_id" JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'polevky') AS fotky_polevek;

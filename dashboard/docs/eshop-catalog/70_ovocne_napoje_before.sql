-- ESHOP — kontrola PŘED 71_ovocne_napoje.sql (jen čtení).
-- Očekáváno (kategorie existuje, ovocné nápoje zatím nejsou):
--   kategorie | napoje_celkem | napoje_v_prodeji | produkty_celkem
--   1         | 0             | 0                | 25
SELECT
  (SELECT count(*) FROM "product_categories" WHERE "slug" = 'ovocne-napoje') AS kategorie,
  (SELECT count(*) FROM "products" WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko')) AS napoje_celkem,
  (SELECT count(*) FROM "products" p JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'ovocne-napoje' AND p."is_active") AS napoje_v_prodeji,
  (SELECT count(*) FROM "products") AS produkty_celkem;

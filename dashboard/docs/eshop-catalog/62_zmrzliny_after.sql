-- ESHOP 1.0 — kontrola PO 61_zmrzliny.sql (jen čtení).
-- Očekáváno (Production 8. 10. 2026):
--   kategorie_zmrzliny | nazev    | poradi | aktivni | produkty | kategorii | ostatni_beze_zmeny
--   1                  | Zmrzliny | 60     | ano     | 0        | 6         | ano
SELECT
  (SELECT count(*) FROM "product_categories" WHERE "slug" = 'zmrzliny') AS kategorie_zmrzliny,
  (SELECT "name" FROM "product_categories" WHERE "slug" = 'zmrzliny') AS nazev,
  (SELECT "sort_order" FROM "product_categories" WHERE "slug" = 'zmrzliny') AS poradi,
  (SELECT CASE WHEN "is_active" THEN 'ano' ELSE 'ne' END FROM "product_categories" WHERE "slug" = 'zmrzliny') AS aktivni,
  (SELECT count(*) FROM "products" p JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'zmrzliny') AS produkty,
  (SELECT count(*) FROM "product_categories") AS kategorii,
  CASE WHEN (SELECT string_agg("slug" || ':' || "sort_order", ',' ORDER BY "sort_order") FROM "product_categories" WHERE "slug" <> 'zmrzliny')
    = 'polevky:10,sirupy:20,caje:30,ovocne-napoje:40,koktejly:50' THEN 'ano' ELSE 'ne' END AS ostatni_beze_zmeny;

-- ESHOP 1.0 — kontrola PŘED 61_zmrzliny.sql (jen čtení).
-- Očekáváno (Production 8. 10. 2026):
--   kategorie_zmrzliny | max_poradi | kategorii
--   0                  | 50         | 5
SELECT
  (SELECT count(*) FROM "product_categories" WHERE "slug" = 'zmrzliny') AS kategorie_zmrzliny,
  (SELECT max("sort_order") FROM "product_categories") AS max_poradi,
  (SELECT count(*) FROM "product_categories") AS kategorii;

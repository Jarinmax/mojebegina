-- ESHOP 1.0 — kontrola PŘED 51_caje.sql (jen čtení).
-- Očekáváno (kategorie Čaje existuje, zatím bez čajů):
--   kategorie_caje | caje_v_prodeji | sekce_kategorie | produkty_celkem
--   1              | 0              | 0               | 17
-- (caje_v_prodeji > 0 a sekce_kategorie = 1 znamená, že skript už běžel —
-- spustit znovu je bezpečné.)
SELECT
  (SELECT count(*) FROM "product_categories" WHERE "slug" = 'caje') AS kategorie_caje,
  (SELECT count(*) FROM "products" p JOIN "product_categories" c ON c."id" = p."category_id" WHERE c."slug" = 'caje' AND p."is_active") AS caje_v_prodeji,
  (SELECT coalesce(jsonb_array_length("detail_sections"), 0) FROM "product_categories" WHERE "slug" = 'caje') AS sekce_kategorie,
  (SELECT count(*) FROM "products") AS produkty_celkem;

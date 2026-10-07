-- PRODUCTION — kontrola PO migracích 0013–0019 (jen čtení).
-- Očekáváno: 24 | 4 | 5 | 7 | 11 | 4 | 2 | 2 | 0 | 5 | 0 | 0 | YES | 0
-- Hláška „relation … does not exist“ = migrace neproběhly (transakce se vrátila).
SELECT
 (SELECT count(*) FROM information_schema.tables WHERE table_schema='public') AS tabulek,
 (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'product%') AS eshop_tabulky,
 (SELECT count(*) FROM product_categories) AS kategorie,
 (SELECT count(*) FROM products) AS produkty,
 (SELECT count(*) FROM product_variants) AS baleni,
 (SELECT count(*) FROM product_images) AS fotky,
 (SELECT count(*) FROM orders WHERE channel='import') AS import,
 (SELECT count(*) FROM orders) AS objednavky,
 (SELECT count(*) FROM orders WHERE channel<>'import') AS ostatni,
 (SELECT count(*) FROM order_items) AS polozky,
 (SELECT count(*) FROM orders WHERE order_number IS NOT NULL) AS s_cislem,
 (SELECT count(*) FROM pg_class WHERE relname='order_number_seq') AS sekvence,
 (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='buyer_organization_id') AS org_nepovinna,
 (SELECT count(*) FROM order_activity) AS aktivity;

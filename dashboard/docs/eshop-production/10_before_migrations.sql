-- PRODUCTION — kontrola PŘED e-shopovými migracemi 0013–0019 (jen čtení).
-- Neon → SQL Editor → větev production (main), databáze neondb.
-- Očekáváno (ověřeno read-only 2. 10. 2026):
--   20 | 0 | 23 | 0 | 0 | 2 | 5 | 0 | 2 | 0 | 2
SELECT
 (SELECT count(*) FROM information_schema.tables WHERE table_schema='public') AS tabulek,
 (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'product%') AS eshop_tabulky,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='orders') AS orders_sloupcu,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name IN ('channel','order_number')) AS eshop_sloupce,
 (SELECT count(*) FROM pg_class WHERE relname='order_number_seq') AS sekvence,
 (SELECT count(*) FROM orders) AS objednavky,
 (SELECT count(*) FROM order_items) AS polozky,
 (SELECT count(*) FROM order_activity) AS aktivity,
 (SELECT count(*) FROM orders WHERE id IN ('329f54d5-5a7d-4522-a21e-b7ad9cde24e2','984e3645-1f2f-4444-8e8e-eeac75165a0a')) AS the_cup,
 (SELECT count(*) FROM orders WHERE total_kc <> subtotal_kc + shipping_kc) AS nesedi_soucet,
 (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('focus_projects','daily_call_queue')) AS migrace_0011_0012;

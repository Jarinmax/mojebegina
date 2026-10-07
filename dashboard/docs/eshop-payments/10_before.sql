-- ESHOP 1.0 — kontrola PŘED 11_migration.sql (jen čtení).
-- Očekáváno na Preview (5. 10. 2026):
--   nove_tabulky | sloupec_vs | puvodni_unique_faktur | faktury | objednavky | eshop_objednavky
--   0            | 0          | 1                     | 2       | 9          | 6
-- (faktury a objednávky si poznamenat — po migraci musí vyjít stejně;
-- nove_tabulky > 0 nebo sloupec_vs = 1 znamená, že migrace už běžela —
-- znovu ji NESPOUŠTĚT.)
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
     AND table_name IN ('payments', 'invoice_customers', 'invoice_customer_refs', 'invoice_provider_links', 'order_payment_balance')) AS nove_tabulky,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_vs') AS sloupec_vs,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'invoices_order_id_unique') AS puvodni_unique_faktur,
  (SELECT count(*) FROM invoices) AS faktury,
  (SELECT count(*) FROM orders) AS objednavky,
  (SELECT count(*) FROM orders WHERE channel = 'eshop') AS eshop_objednavky;

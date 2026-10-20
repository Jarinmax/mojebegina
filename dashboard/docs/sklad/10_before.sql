-- SKLAD 1.0 — kontrola PŘED 11_migration.sql (jen čtení, nic nemění).
-- Očekáváno (Production main i Preview):
--   je_production | eshop_0022 | katalog | skladove_tabulky | skladove_funkce | objednavky | faktury | produkty
--   true/false    | 1          | 1       | 0                | 0               | N1         | N2      | N3
-- je_production = true jen na Production main (na Preview false).
-- objednavky / faktury / produkty si poznamenat — po migraci musí vyjít stejně.
-- skladove_tabulky > 0 nebo skladove_funkce > 0 = migrace už běžela, znovu ji NESPOUŠTĚT.
SELECT
  current_setting('neon.timeline_id', true) = '70a96b3677653646e65343cae8e27182' AS je_production,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'dic') AS eshop_0022,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_variants') AS katalog,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
     AND table_name IN ('suppliers', 'supplier_item_mappings', 'stock_locations', 'stock_items', 'goods_receipts',
                        'goods_receipt_documents', 'goods_receipt_document_pages', 'goods_receipt_lines',
                        'goods_receipt_activity', 'stock_movements', 'stock_item_balances')) AS skladove_tabulky,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('goods_receipt_document_pages_unique_active_sha256', 'goods_receipts_confirm_sha256_guard',
                                                  'goods_receipt_lines_reset_vat_confirmed', 'goods_receipt_lines_bump_updated_at')) AS skladove_funkce,
  (SELECT count(*) FROM orders) AS objednavky,
  (SELECT count(*) FROM invoices) AS faktury,
  (SELECT count(*) FROM products) AS produkty;

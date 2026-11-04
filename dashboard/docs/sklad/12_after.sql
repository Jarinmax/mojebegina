-- SKLAD 1.0 — kontrola PO 11_migration.sql (jen čtení, nic nemění).
-- Očekáváno:
--   skladove_tabulky | pohled_zustatku | triggery | vychozi_sklad | dodavatele | karty | prijemky | pohyby | duplicita_4_sloupce | celek_dokladu | druh_karty | objednavky | faktury | produkty
--   10               | 1               | 4        | 1             | 0          | 0     | 0        | 0      | 4                   | 1             | 1          | N1         | N2      | N3
-- (objednavky / faktury / produkty = stejná čísla jako v 10_before.sql)
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     AND table_name IN ('suppliers', 'supplier_item_mappings', 'stock_locations', 'stock_items', 'goods_receipts',
                        'goods_receipt_documents', 'goods_receipt_document_pages', 'goods_receipt_lines',
                        'goods_receipt_activity', 'stock_movements')) AS skladove_tabulky,
  (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'stock_item_balances') AS pohled_zustatku,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
     AND tgname IN ('goods_receipt_document_pages_unique_active_sha256', 'goods_receipts_confirm_sha256_guard',
                    'goods_receipt_lines_reset_vat_confirmed', 'goods_receipt_lines_bump_updated_at')) AS triggery,
  (SELECT count(*) FROM stock_locations WHERE code = 'default') AS vychozi_sklad,
  (SELECT count(*) FROM suppliers) AS dodavatele,
  (SELECT count(*) FROM stock_items) AS karty,
  (SELECT count(*) FROM goods_receipts) AS prijemky,
  (SELECT count(*) FROM stock_movements) AS pohyby,
  (SELECT array_length(indkey::int2[], 1) FROM pg_index WHERE indexrelid = 'goods_receipts_confirmed_document_once_key'::regclass) AS duplicita_4_sloupce,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'goods_receipts' AND column_name = 'document_total_with_vat_hal') AS celek_dokladu,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'stock_items_kind_check'
     AND pg_get_constraintdef(oid) LIKE '%stock_material%' AND pg_get_constraintdef(oid) NOT LIKE '%ingredient%') AS druh_karty,
  (SELECT count(*) FROM orders) AS objednavky,
  (SELECT count(*) FROM invoices) AS faktury,
  (SELECT count(*) FROM products) AS produkty;

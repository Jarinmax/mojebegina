-- ŠARŽE 1.0 — kontrola PŘED 11_migration.sql (jen čtení, nic nemění).
-- Očekáváno:
--   sklad_tabulky | sklad_vychozi | sarze_tabulky | lot_code | dynova | baleni
--   10            | 1             | 0             | 0        | 1      | 1
-- sklad_tabulky < 10  = Sklad 1.0 ještě není nasazený → NESPOUŠTĚT (nejdřív Sklad).
-- sarze_tabulky > 0 nebo lot_code = 1 = migrace už běžela → NESPOUŠTĚT znovu.
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
     AND table_name IN ('suppliers', 'supplier_item_mappings', 'stock_locations', 'stock_items', 'goods_receipts',
                        'goods_receipt_documents', 'goods_receipt_document_pages', 'goods_receipt_lines',
                        'goods_receipt_activity', 'stock_movements')) AS sklad_tabulky,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_locations')
    AS sklad_vychozi,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
     AND table_name IN ('production_batches', 'production_batch_activity', 'production_receipts',
                        'production_receipt_lines', 'production_batch_balances')) AS sarze_tabulky,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'lot_code') AS lot_code,
  (SELECT count(*) FROM products WHERE id = '50fdd325-a225-4437-b162-5b1b445d8b95' AND shelf_life_days = 14) AS dynova,
  (SELECT count(*) FROM product_variants WHERE id = '67d70837-4015-420e-847b-7e4c59733cb8'
     AND product_id = '50fdd325-a225-4437-b162-5b1b445d8b95' AND is_active) AS baleni;

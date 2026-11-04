-- SKLAD 1.0 — kontrola PŘED 14_dodavatel_volitelny.sql (jen čtení, nic nemění).
-- Navazuje na 10→11→12 (sklad už musí existovat). Očekáváno:
--   sklad_existuje | supplier_id_not_null | dodavatele | prijemky
--   1              | true                 | N1         | N2
-- sklad_existuje musí být 1 (10 skladových tabulek) — jinak nejdřív 11_migration.sql.
-- supplier_id_not_null musí být true — jinak migrace už proběhla, NESPOUŠTĚT znovu.
-- dodavatele / příjemky si poznamenat — po migraci musí vyjít stejně (nic se nemaže).
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
     AND table_name IN ('suppliers', 'supplier_item_mappings', 'stock_locations', 'stock_items', 'goods_receipts',
                        'goods_receipt_documents', 'goods_receipt_document_pages', 'goods_receipt_lines',
                        'goods_receipt_activity', 'stock_movements')) = 10 AS sklad_existuje,
  (SELECT is_nullable = 'NO' FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'goods_receipts' AND column_name = 'supplier_id') AS supplier_id_not_null,
  (SELECT count(*) FROM suppliers) AS dodavatele,
  (SELECT count(*) FROM goods_receipts) AS prijemky;

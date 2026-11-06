-- ŠARŽE 1.0 — vrácení 11_migration.sql. JEN dokud neexistuje žádná šarže
-- (po založení první šarže jsou záznamy auditní doklad a nemažou se —
-- skript to sám ověří a jinak skončí chybou, nic nezmění).

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM production_batches) THEN
    RAISE EXCEPTION 'Existují šarže — rollback by smazal auditní záznamy, ZASTAVENO';
  END IF;
END $$;

DROP VIEW production_batch_balances;
DROP FUNCTION confirm_production_receipt(uuid, text);
DROP TRIGGER products_lot_code_immutable ON products;
DROP FUNCTION products_lot_code_immutable();
DROP TRIGGER stock_movements_finished_requires_batch ON stock_movements;
DROP FUNCTION stock_movements_finished_requires_batch();
DROP TRIGGER stock_movements_append_only ON stock_movements;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_production_line_has_batch;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_one_source;
DROP INDEX stock_movements_production_batch_idx;
ALTER TABLE stock_movements DROP COLUMN production_receipt_line_id, DROP COLUMN production_receipt_id, DROP COLUMN production_batch_id;
DROP TABLE production_receipt_lines;
DROP TABLE production_receipts;
DROP TABLE production_batch_activity;
DROP TABLE production_batches;
DROP FUNCTION production_audit();
DROP FUNCTION production_receipt_lines_guard();
DROP FUNCTION production_receipts_guard();
DROP FUNCTION production_batches_guard();
DROP FUNCTION production_forbid_change();
DROP FUNCTION begina_actor_user_id();
-- skladové položky hotových výrobků (bez pohybů, protože šarže nejsou)
DELETE FROM stock_items WHERE kind = 'finished_product';
DROP INDEX stock_items_finished_variant_key;
ALTER TABLE stock_items DROP CONSTRAINT stock_items_finished_has_variant;
ALTER TABLE stock_items DROP CONSTRAINT stock_items_kind_check;
ALTER TABLE stock_items ADD CONSTRAINT stock_items_kind_check
  CHECK (kind IN ('stock_material', 'resale_goods', 'operating_supply'));
DROP INDEX products_lot_code_key;
ALTER TABLE products DROP CONSTRAINT products_lot_code_format;
ALTER TABLE products DROP COLUMN lot_code;

COMMIT;

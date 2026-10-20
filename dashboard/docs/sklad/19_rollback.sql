-- SKLAD 1.0 — VRÁCENÍ 11_migration.sql (0024 → 0023 → stav před skladem).
-- Jen dokud ve skladu nejsou žádná data: dodavatelé, karty, příjemky, fotky,
-- pohyby, mapování ani jiný sklad než výchozí. Pokud něco existuje, skript
-- skončí chybou a NIC nezmění (data by se ztratila). Originální fotky ve
-- Vercel Blob tento skript nemaže (viz RETENCE_FOTEK.md).
-- Jedna transakce, spouštět celý soubor, JEN po výslovném schválení.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM suppliers)
     OR EXISTS (SELECT 1 FROM supplier_item_mappings)
     OR EXISTS (SELECT 1 FROM stock_items)
     OR EXISTS (SELECT 1 FROM goods_receipts)
     OR EXISTS (SELECT 1 FROM goods_receipt_documents)
     OR EXISTS (SELECT 1 FROM goods_receipt_document_pages)
     OR EXISTS (SELECT 1 FROM goods_receipt_lines)
     OR EXISTS (SELECT 1 FROM goods_receipt_activity)
     OR EXISTS (SELECT 1 FROM stock_movements)
     OR EXISTS (SELECT 1 FROM stock_locations WHERE code <> 'default')
  THEN
    RAISE EXCEPTION 'Vrácení zastaveno: sklad už obsahuje data (dodavatelé, karty, příjemky nebo pohyby) — data by se ztratila.';
  END IF;
END $$;

-- 0024: „Znovu přečíst doklad“ + trigger updated_at řádků
DROP TRIGGER goods_receipt_lines_bump_updated_at ON goods_receipt_lines;
DROP FUNCTION goods_receipt_lines_bump_updated_at();

-- 0023: pohled, triggery, tabulky (od závislých k nezávislým)
DROP VIEW stock_item_balances;
DROP TRIGGER goods_receipt_lines_reset_vat_confirmed ON goods_receipt_lines;
DROP FUNCTION goods_receipt_lines_reset_vat_confirmed();
DROP TRIGGER goods_receipts_confirm_sha256_guard ON goods_receipts;
DROP FUNCTION goods_receipts_confirm_sha256_guard();
DROP TRIGGER goods_receipt_document_pages_unique_active_sha256 ON goods_receipt_document_pages;
DROP FUNCTION goods_receipt_document_pages_unique_active_sha256();
DROP TABLE stock_movements;
DROP TABLE goods_receipt_activity;
DROP TABLE goods_receipt_lines;
DROP TABLE goods_receipt_document_pages;
DROP TABLE goods_receipt_documents;
DROP TABLE goods_receipts;
DROP TABLE supplier_item_mappings;
DROP TABLE stock_items;
DROP TABLE stock_locations;
DROP TABLE suppliers;

COMMIT;

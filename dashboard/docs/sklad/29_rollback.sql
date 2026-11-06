-- SKLAD 1.1 (hotové výrobky) — VRÁCENÍ 21_migration.sql (0030 → stav po 0029,
-- tj. jen Sklad 1.0). Jen dokud Sklad 1.1 ještě NEMÁ žádná data: žádná
-- šarže, žádná rezervace a žádný skladový pohyb druhu production_in,
-- dispatch_out nebo inventory_correction (= appka 1.1 ještě nic nezapsala).
-- Pokud něco existuje, skript skončí chybou a NIC nezmění (data by se
-- ztratila). Sklad 1.0 (dodavatelé, karty, příjemky, pohyby z příjemek)
-- tento skript nemaže.
-- Jedna transakce, spouštět celý soubor, JEN po výslovném schválení.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stock_batches)
     OR EXISTS (SELECT 1 FROM stock_reservations)
     OR EXISTS (SELECT 1 FROM stock_movements WHERE kind IN ('production_in', 'dispatch_out', 'inventory_correction'))
  THEN
    RAISE EXCEPTION 'Vrácení zastaveno: Sklad 1.1 (hotové výrobky) už obsahuje data (šarže, rezervace nebo pohyb výroby/výdeje/inventury) — data by se ztratila.';
  END IF;
END $$;

-- Pohled dostupnosti (physical/reserved/free) — závisí na stock_reservations.
DROP VIEW stock_item_availability;

-- Kontroly, které 0030 přidala na stock_movements/stock_items.
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_inventory_correction_has_reason;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE stock_items DROP CONSTRAINT stock_items_kind_check;

-- Vazba stock_movements → stock_batches a nové sloupce (kind doplnila 0030
-- zpětně i starým pohybům z příjemek — vrácením se tahle informace ztratí,
-- což je v pořádku: před 0030 "kind" vůbec neexistoval).
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_batch_id_stock_batches_id_fk;
DROP INDEX stock_movements_batch_idx;
ALTER TABLE stock_movements DROP COLUMN note;
ALTER TABLE stock_movements DROP COLUMN responsible_user_id;
ALTER TABLE stock_movements DROP COLUMN batch_id;
ALTER TABLE stock_movements DROP COLUMN kind;

-- Obnovit přesně kontrolu druhu karty z 0028 (bez finished_good).
ALTER TABLE stock_items ADD CONSTRAINT stock_items_kind_check CHECK (kind IN ('stock_material', 'resale_goods', 'operating_supply'));

-- Nové tabulky (indexy a FK na ně samy padnou s DROP TABLE).
DROP TABLE stock_reservations;
DROP TABLE stock_batches;

COMMIT;

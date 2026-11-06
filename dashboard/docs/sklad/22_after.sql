-- SKLAD 1.1 (hotové výrobky) — kontrola PO 21_migration.sql (jen čtení, nic nemění).
-- Očekáváno:
--   sklad_1_1_tabulky | pohled_dostupnosti | nove_sloupce | druh_karty_hotovy_vyrobek | druh_pohybu | sarze | rezervace | objednavky | faktury | produkty | pohyby
--   2                 | 1                  | 4            | 1                         | 1           | 0     | 0         | N1         | N2      | N3       | N4
-- (objednavky / faktury / produkty / pohyby = stejná čísla jako v 20_before.sql)
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     AND table_name IN ('stock_batches', 'stock_reservations')) AS sklad_1_1_tabulky,
  (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'stock_item_availability') AS pohled_dostupnosti,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'stock_movements'
       AND column_name IN ('kind', 'batch_id', 'responsible_user_id', 'note')) AS nove_sloupce,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'stock_items_kind_check'
     AND pg_get_constraintdef(oid) LIKE '%finished_good%') AS druh_karty_hotovy_vyrobek,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'stock_movements_kind_check'
     AND pg_get_constraintdef(oid) LIKE '%production_in%') AS druh_pohybu,
  (SELECT count(*) FROM stock_batches) AS sarze,
  (SELECT count(*) FROM stock_reservations) AS rezervace,
  (SELECT count(*) FROM orders) AS objednavky,
  (SELECT count(*) FROM invoices) AS faktury,
  (SELECT count(*) FROM products) AS produkty,
  (SELECT count(*) FROM stock_movements) AS pohyby;

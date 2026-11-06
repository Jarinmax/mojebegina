-- SKLAD 1.1 (hotové výrobky) — kontrola PŘED 21_migration.sql (jen čtení, nic nemění).
-- Očekáváno (Production main i Preview, po Skladu 1.0):
--   je_production | sklad_1_0 | sklad_1_1_tabulky | sklad_1_1_pohled | objednavky | faktury | produkty | pohyby
--   true/false    | 1         | 0                 | 0                | N1         | N2      | N3       | N4
-- je_production = true jen na Production main (na Preview false).
-- sklad_1_0 = 1 (goods_receipts.reextraction_status existuje, tj. 0028+0029 proběhly) — jinak 21_migration.sql STOPne.
-- sklad_1_1_tabulky > 0 nebo sklad_1_1_pohled > 0 = migrace 0030 už běžela, znovu ji NESPOUŠTĚT.
-- objednavky / faktury / produkty / pohyby si poznamenat — po migraci musí vyjít stejně (0030 jen přidává).
SELECT
  current_setting('neon.timeline_id', true) = '70a96b3677653646e65343cae8e27182' AS je_production,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'goods_receipts' AND column_name = 'reextraction_status') AS sklad_1_0,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
     AND table_name IN ('stock_batches', 'stock_reservations')) AS sklad_1_1_tabulky,
  (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'stock_item_availability') AS sklad_1_1_pohled,
  (SELECT count(*) FROM orders) AS objednavky,
  (SELECT count(*) FROM invoices) AS faktury,
  (SELECT count(*) FROM products) AS produkty,
  (SELECT count(*) FROM stock_movements) AS pohyby;

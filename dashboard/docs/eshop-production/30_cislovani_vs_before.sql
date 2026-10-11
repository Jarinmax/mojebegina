-- PRODUCTION — kontrola PŘED zapnutím číslování „číslo objednávky = VS“
-- (jen čtení). Koncepce schválena 10. 10. 2026; spuštění zatím NE.
-- Očekáváno (Production 10. 10. 2026): 0 | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 70000001
--   eshop / rucni vyšší je v pořádku (objednávky přibyly); eshop_bez_vs,
--   import_s_vs a s_cislem MUSÍ být 0.
SELECT
 (SELECT count(*) FROM pg_class WHERE relname = 'order_number_seq') AS rada_preview,
 (SELECT count(*) FROM pg_trigger WHERE tgname = 'orders_assign_number') AS trigger_cislo,
 (SELECT count(*) FROM orders WHERE channel = 'import') AS import,
 (SELECT count(*) FROM orders WHERE channel = 'eshop') AS eshop,
 (SELECT count(*) FROM orders WHERE channel = 'eshop' AND payment_vs IS NULL) AS eshop_bez_vs,
 (SELECT count(*) FROM orders WHERE channel = 'import' AND payment_vs IS NOT NULL) AS import_s_vs,
 (SELECT count(*) FROM orders WHERE channel = 'manual') AS rucni,
 (SELECT count(*) FROM orders WHERE order_number IS NOT NULL) AS s_cislem,
 (SELECT max(payment_vs) FROM orders) AS nejvyssi_vs;

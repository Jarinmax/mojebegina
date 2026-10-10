-- PRODUCTION — kontrola PO zapnutí číslování „číslo objednávky = VS“ (jen čtení).
-- Očekáváno (Production 10. 10. 2026): 1 | 2 | 2 | 0 | 0 | 70000001 | 70000002
--   (přibyly-li objednávky, nejvyssi_cislo a dalsi_cislo jsou vyšší;
--    bez_cisla a nesouhlasi_s_vs MUSÍ být 0)
SELECT
 (SELECT count(*) FROM pg_trigger WHERE tgname = 'orders_assign_number') AS trigger_cislo,
 (SELECT count(*) FROM pg_constraint WHERE conname IN ('orders_number_equals_vs', 'orders_import_outside_series')) AS pojistky,
 (SELECT count(*) FROM orders WHERE channel = 'import' AND order_number IS NULL AND payment_vs IS NULL) AS import_bez_cisla,
 (SELECT count(*) FROM orders WHERE channel <> 'import' AND (order_number IS NULL OR payment_vs IS NULL)) AS bez_cisla,
 (SELECT count(*) FROM orders WHERE channel <> 'import' AND order_number <> payment_vs::bigint) AS nesouhlasi_s_vs,
 (SELECT max(order_number) FROM orders WHERE channel <> 'import') AS nejvyssi_cislo,
 (SELECT '7' || lpad((last_value + 1)::text, 7, '0') FROM pg_sequences WHERE sequencename = 'payment_vs_seq') AS dalsi_cislo;

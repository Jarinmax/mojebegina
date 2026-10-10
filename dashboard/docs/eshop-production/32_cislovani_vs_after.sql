-- PRODUCTION — kontrola PO zapnutí číslování „číslo objednávky = VS“ (jen čtení).
-- Očekáváno (Production 10. 10. 2026): 1 | 3 | 2 | 0 | 0 | 70000001 | 70000002
--   (přibyly-li objednávky, nejvyssi_cislo a dalsi_cislo jsou vyšší;
--    bez_cisla a nesouhlasi_s_vs MUSÍ být 0)
SELECT
 (SELECT count(*) FROM pg_trigger WHERE tgname = 'orders_assign_number') AS trigger_cislo,
 (SELECT count(*) FROM pg_constraint WHERE conname IN ('orders_number_required', 'orders_number_equals_vs', 'orders_number_range')) AS pojistky,
 (SELECT count(*) FROM orders WHERE channel = 'import' AND order_number IS NULL) AS import_bez_cisla,
 (SELECT count(*) FROM orders WHERE channel <> 'import' AND order_number IS NULL) AS bez_cisla,
 (SELECT count(*) FROM orders WHERE payment_vs IS NOT NULL AND order_number <> payment_vs::bigint) AS nesouhlasi_s_vs,
 (SELECT max(order_number) FROM orders) AS nejvyssi_cislo,
 (SELECT '7' || lpad((last_value + 1)::text, 7, '0') FROM pg_sequences WHERE sequencename = 'payment_vs_seq') AS dalsi_cislo;

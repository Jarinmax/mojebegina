-- PRODUCTION — kontrola PŘED zapnutím číslování (jen čtení). Spouštět v den
-- přepnutí, AŽ je pokladna WooCommerce vypnutá a migrace 0013–0019 hotové.
-- Očekáváno: 0 | 1 | 0 | 2 | 0 | 0 | 0
-- (rucni > 0 = ruční objednávky založené v MojeBegina po migraci — dostanou
--  čísla START+1… jako první, podle data; to je v pořádku, řada je společná)
SELECT
 (SELECT count(*) FROM pg_class WHERE relname='order_number_seq') AS sekvence,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='order_number') AS sloupec_0018,
 (SELECT count(*) FROM pg_constraint WHERE conname='orders_number_required') AS check_cislo,
 (SELECT count(*) FROM orders WHERE channel='import') AS import,
 (SELECT count(*) FROM orders WHERE channel='eshop') AS eshop,
 (SELECT count(*) FROM orders WHERE order_number IS NOT NULL) AS s_cislem,
 (SELECT count(*) FROM orders WHERE channel='manual') AS rucni;

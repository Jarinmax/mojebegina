-- ESHOP 1.0 — kontrola PŘED 21_migration.sql (jen čtení).
-- Očekáváno na Preview po nasazení nového kódu a jedné testovací objednávce:
--   krok_a | povinny_vs | eshop_objednavky | eshop_bez_vs | nejnovejsi_eshop_vs
--   ano    | 0          | <počet>          | <počet − 1>  | 70000001 (nebo vyšší)
-- nejnovejsi_eshop_vs prázdné = nový kód ještě neběží nebo nebyla vytvořena
-- testovací objednávka → migraci NESPOUŠTĚT. povinny_vs = 1 → už běžela.
SELECT
  CASE WHEN to_regclass('public.payments') IS NOT NULL THEN 'ano' ELSE 'ne' END AS krok_a,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'orders_eshop_requires_vs') AS povinny_vs,
  (SELECT count(*) FROM orders WHERE channel = 'eshop') AS eshop_objednavky,
  (SELECT count(*) FROM orders WHERE channel = 'eshop' AND payment_vs IS NULL) AS eshop_bez_vs,
  (SELECT payment_vs FROM orders WHERE channel = 'eshop' ORDER BY ordered_at DESC, created_at DESC LIMIT 1) AS nejnovejsi_eshop_vs;

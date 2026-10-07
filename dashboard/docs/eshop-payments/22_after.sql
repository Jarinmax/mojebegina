-- ESHOP 1.0 — kontrola PO 21_migration.sql (jen čtení).
-- Očekáváno na Preview:
--   povinny_vs | eshop_objednavky | eshop_bez_vs | vs_unikatni | vs_ve_formatu
--   1          | <stejně jako před> | 0          | ano         | ano
SELECT
  (SELECT count(*) FROM pg_constraint WHERE conname = 'orders_eshop_requires_vs' AND convalidated) AS povinny_vs,
  (SELECT count(*) FROM orders WHERE channel = 'eshop') AS eshop_objednavky,
  (SELECT count(*) FROM orders WHERE channel = 'eshop' AND payment_vs IS NULL) AS eshop_bez_vs,
  CASE WHEN (SELECT count(payment_vs) = count(DISTINCT payment_vs) FROM orders) THEN 'ano' ELSE 'ne' END AS vs_unikatni,
  CASE WHEN NOT EXISTS (SELECT 1 FROM orders WHERE payment_vs IS NOT NULL AND payment_vs !~ '^7[0-9]{7}$') THEN 'ano' ELSE 'ne' END AS vs_ve_formatu;

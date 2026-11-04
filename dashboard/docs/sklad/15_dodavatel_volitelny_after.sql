-- SKLAD 1.0 — kontrola PO 14_dodavatel_volitelny.sql (jen čtení, nic nemění).
-- Očekáváno: supplier_id_not_null = false; dodavatele/příjemky stejné jako v 13_before.sql.
SELECT
  (SELECT is_nullable = 'NO' FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'goods_receipts' AND column_name = 'supplier_id') AS supplier_id_not_null,
  (SELECT count(*) FROM suppliers) AS dodavatele,
  (SELECT count(*) FROM goods_receipts) AS prijemky;

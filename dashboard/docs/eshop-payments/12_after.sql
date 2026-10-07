-- ESHOP 1.0 — kontrola PO 11_migration.sql (jen čtení).
-- Očekáváno na Preview:
--   nove_tabulky | sloupec_vs | rada_vs | pojistka_vs | puvodni_unique_faktur | faktury | faktury_import_vystavene | objednavky | objednavky_s_vs | platby | stav_uhrad
--   5            | 1          | 1       | 1           | 0                     | 2       | 2                        | 9          | 0               | 0      | 9
-- (faktury a objednavky = stejná čísla jako v kontrole před; stav_uhrad = objednavky)
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
     AND table_name IN ('payments', 'invoice_customers', 'invoice_customer_refs', 'invoice_provider_links', 'order_payment_balance')) AS nove_tabulky,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_vs') AS sloupec_vs,
  (SELECT count(*) FROM information_schema.sequences WHERE sequence_name = 'payment_vs_seq') AS rada_vs,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'orders_payment_vs_immutable') AS pojistka_vs,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'invoices_order_id_unique') AS puvodni_unique_faktur,
  (SELECT count(*) FROM invoices) AS faktury,
  (SELECT count(*) FROM invoices WHERE origin = 'import' AND doc_state = 'issued' AND document_type = 'invoice') AS faktury_import_vystavene,
  (SELECT count(*) FROM orders) AS objednavky,
  (SELECT count(*) FROM orders WHERE payment_vs IS NOT NULL) AS objednavky_s_vs,
  (SELECT count(*) FROM payments) AS platby,
  (SELECT count(*) FROM order_payment_balance) AS stav_uhrad;

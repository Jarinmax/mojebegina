-- ESHOP 1.0 — VRÁCENÍ 11_migration.sql (krok A).
-- Jen dokud nevznikla žádná nová data: platby, zákazníci pro fakturaci,
-- vazby na poskytovatele, VS u objednávek, nové faktury ani dobropisy.
-- Pokud nějaká existují, skript skončí chybou a NIC nezmění (data by se
-- ztratila). Jedna transakce, spouštět celý soubor.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payments)
     OR EXISTS (SELECT 1 FROM invoice_customers)
     OR EXISTS (SELECT 1 FROM invoice_customer_refs)
     OR EXISTS (SELECT 1 FROM invoice_provider_links)
     OR EXISTS (SELECT 1 FROM orders WHERE payment_vs IS NOT NULL)
     OR EXISTS (SELECT 1 FROM invoices WHERE origin <> 'import' OR document_type <> 'invoice' OR doc_state <> 'issued')
  THEN
    RAISE EXCEPTION 'Vrácení zastaveno: už existují platby, VS nebo nové faktury — data by se ztratila.';
  END IF;
END $$;

-- 5. vazby na poskytovatele
DROP TABLE invoice_provider_links;

-- 4. faktury zpět do původního tvaru
DROP INDEX invoices_order_idx;
DROP INDEX invoices_one_sales_invoice_per_order;
ALTER TABLE invoices
  DROP CONSTRAINT invoices_issued_has_number,
  DROP CONSTRAINT invoices_credit_note_has_origin,
  DROP CONSTRAINT invoices_doc_state_check,
  DROP CONSTRAINT invoices_origin_check,
  DROP CONSTRAINT invoices_document_type_check;
ALTER TABLE invoices
  DROP COLUMN updated_at,
  DROP COLUMN pdf_sent_at,
  DROP COLUMN customer_id,
  DROP COLUMN payment_vs,
  DROP COLUMN doc_state,
  DROP COLUMN origin,
  DROP COLUMN corrects_invoice_id,
  DROP COLUMN document_type;
ALTER TABLE invoices
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN issued_at SET NOT NULL,
  ALTER COLUMN invoice_number SET NOT NULL,
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE invoices ADD CONSTRAINT invoices_order_id_unique UNIQUE (order_id);

-- 3. zákazníci pro fakturaci
DROP TABLE invoice_customer_refs;
DROP TABLE invoice_customers;

-- 2. platby
DROP VIEW order_payment_balance;
DROP TABLE payments;

-- 1. VS
DROP TRIGGER orders_payment_vs_immutable ON orders;
DROP FUNCTION orders_payment_vs_immutable();
ALTER TABLE orders DROP CONSTRAINT orders_payment_vs_format;
ALTER TABLE orders DROP CONSTRAINT orders_payment_vs_key;
ALTER TABLE orders DROP COLUMN payment_vs;
DROP SEQUENCE payment_vs_seq;

COMMIT;

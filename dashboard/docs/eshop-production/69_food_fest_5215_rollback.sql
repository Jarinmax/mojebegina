-- NÁVRAT importu #5215 — jen dokud k objednávce NENÍ vystavená faktura
-- (vystavená faktura se nemaže, opravuje se dobropisem). DIČ firmy zůstává.
DO $$
DECLARE
  oid uuid;
BEGIN
  SELECT id INTO oid FROM orders WHERE external_woocommerce_id = '5215';
  IF oid IS NULL THEN
    RAISE EXCEPTION 'Objednávka 5215 v MojeBegina není — nic k vrácení.';
  END IF;
  IF EXISTS (SELECT 1 FROM invoices WHERE order_id = oid AND doc_state = 'issued')
     OR EXISTS (SELECT 1 FROM invoice_provider_links l JOIN invoices i ON i.id = l.invoice_id
                WHERE i.order_id = oid AND l.external_id IS NOT NULL) THEN
    RAISE EXCEPTION 'K objednávce už existuje faktura v iDokladu — import nejde vrátit, zastavuji.';
  END IF;
  DELETE FROM invoice_provider_links WHERE invoice_id IN (SELECT id FROM invoices WHERE order_id = oid);
  DELETE FROM invoices WHERE order_id = oid;
  DELETE FROM payments WHERE order_id = oid;
  DELETE FROM order_activity WHERE order_id = oid;
  DELETE FROM order_items WHERE order_id = oid;
  DELETE FROM orders WHERE id = oid;
  RAISE NOTICE 'Import 5215 vrácen.';
END $$;

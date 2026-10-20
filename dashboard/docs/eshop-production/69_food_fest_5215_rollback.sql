-- NÁVRAT importu #5215 — jen dokud k objednávce NENÍ vystavená faktura
-- (vystavená faktura se nemaže, opravuje se dobropisem).
-- Firmu založenou skriptem 65 vrátí také (smaže firmu, lead vrátí do
-- původní fáze bez propojení) — jen pokud k ní nic jiného nepřibylo.
-- Firma z ručního převodu leadu (skript 62) zůstává i s DIČ.
DO $$
DECLARE
  oid uuid;
  org uuid;
  conv lead_activity%ROWTYPE;
BEGIN
  SELECT id, buyer_organization_id INTO oid, org FROM orders WHERE external_woocommerce_id = '5215';
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

  SELECT a.* INTO conv FROM lead_activity a
   WHERE a.kind = 'converted' AND a.metadata->>'source' = 'script:65'
     AND a.metadata->>'organizationId' = org::text;
  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM orders WHERE buyer_organization_id = org)
       OR EXISTS (SELECT 1 FROM invoices WHERE organization_id = org)
       OR EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id = org)
       OR EXISTS (SELECT 1 FROM locations WHERE organization_id = org)
       OR EXISTS (SELECT 1 FROM notifications WHERE organization_id = org)
       OR EXISTS (SELECT 1 FROM referrals WHERE referrer_organization_id = org OR referred_organization_id = org)
       OR EXISTS (SELECT 1 FROM leads WHERE converted_organization_id = org AND id <> conv.lead_id)
       OR EXISTS (SELECT 1 FROM invoices i JOIN invoice_customers c ON c.id = i.customer_id WHERE c.organization_id = org) THEN
      RAISE EXCEPTION 'K firmě Food Fest Crew mezitím přibyly další záznamy — návrat zastaven, nic se nezměnilo.';
    END IF;
    DELETE FROM invoice_customer_refs WHERE customer_id IN (SELECT id FROM invoice_customers WHERE organization_id = org);
    DELETE FROM invoice_customers WHERE organization_id = org;
    UPDATE leads SET converted_organization_id = NULL, stage = conv.metadata->>'previousStage', updated_at = now()
     WHERE id = conv.lead_id;
    DELETE FROM lead_activity WHERE id = conv.id;
    DELETE FROM organizations WHERE id = org;
    RAISE NOTICE 'Import 5215 vrácen, firma ze skriptu 65 odstraněna, lead vrácen do fáze %.', conv.metadata->>'previousStage';
  ELSE
    RAISE NOTICE 'Import 5215 vrácen.';
  END IF;
END $$;

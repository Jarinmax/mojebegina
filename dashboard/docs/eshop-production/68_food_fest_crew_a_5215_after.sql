-- KONTROLA PO skriptu 65 (jen čtení).
-- Očekáváno: 1 | CZ08911088 | ano | 1 | 0 | 1 | 12647 | 1 | paid | 0
--   firma              firem s IČO 08911088 — 1
--   dic                DIČ firmy
--   sidlo_ok           sídlo jde rozdělit na ulici, PSČ a město
--   lead_propojeny     lead Tomáše Herouta převedený na tuto firmu — 1
--   ucty_firmy         uživatelských účtů ve firmě — 0 (žádný účet ani pozvánka)
--   obj_5215 … uhrada  objednávka 5215 u firmy, 12 647 Kč, 1 platba, uhrazeno
--   vystavene_faktury  0 — faktura vznikne až tlačítkem v MojeBegina
SELECT
 (SELECT count(*) FROM organizations WHERE ico = '08911088') AS firma,
 (SELECT dic FROM organizations WHERE ico = '08911088') AS dic,
 (SELECT CASE WHEN bool_and(registered_address ~ ',\s*[0-9]{3}\s?[0-9]{2}\s+\S') THEN 'ano' ELSE 'ne' END
   FROM organizations WHERE ico = '08911088') AS sidlo_ok,
 (SELECT count(*) FROM leads l JOIN organizations o ON o.id = l.converted_organization_id
   WHERE o.ico = '08911088' AND l.id = 'cb5b6742-8031-40c9-9ac3-7456a946f061' AND l.stage = 'converted') AS lead_propojeny,
 (SELECT count(*) FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
   WHERE o.ico = '08911088') AS ucty_firmy,
 (SELECT count(*) FROM orders r JOIN organizations o ON o.id = r.buyer_organization_id
   WHERE r.external_woocommerce_id = '5215' AND o.ico = '08911088') AS obj_5215,
 (SELECT total_kc FROM orders WHERE external_woocommerce_id = '5215') AS celkem,
 (SELECT count(*) FROM payments p JOIN orders o ON o.id = p.order_id
   WHERE o.external_woocommerce_id = '5215' AND p.direction = 'inflow' AND p.status = 'succeeded') AS platby,
 (SELECT b.balance_state FROM order_payment_balance b JOIN orders o ON o.id = b.order_id
   WHERE o.external_woocommerce_id = '5215') AS uhrada,
 (SELECT count(*) FROM invoices i JOIN orders o ON o.id = i.order_id
   WHERE o.external_woocommerce_id = '5215' AND i.doc_state = 'issued') AS vystavene_faktury;

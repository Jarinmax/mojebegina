-- KONTROLA PO importu #5215 (jen čtení). Očekáváno: 1 | CZ08911088 | 12647 | 1 | paid | 0
SELECT
 (SELECT count(*) FROM orders WHERE external_woocommerce_id = '5215') AS obj_5215,
 (SELECT dic FROM organizations WHERE ico = '08911088') AS dic,
 (SELECT total_kc FROM orders WHERE external_woocommerce_id = '5215') AS celkem,
 (SELECT count(*) FROM payments p JOIN orders o ON o.id = p.order_id
   WHERE o.external_woocommerce_id = '5215' AND p.direction = 'inflow' AND p.status = 'succeeded') AS platby,
 (SELECT b.balance_state FROM order_payment_balance b JOIN orders o ON o.id = b.order_id
   WHERE o.external_woocommerce_id = '5215') AS uhrada,
 (SELECT count(*) FROM invoices i JOIN orders o ON o.id = i.order_id
   WHERE o.external_woocommerce_id = '5215' AND i.doc_state = 'issued') AS vystavene_faktury;

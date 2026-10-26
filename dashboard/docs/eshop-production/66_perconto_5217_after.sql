-- KONTROLA PO importu #5217 (jen čtení). Očekáváno: 1 | 3d7c57e0-510d-4cb3-8883-5662fe592a77 | 3800 | unpaid | 5 | 0
SELECT
 (SELECT count(*) FROM orders WHERE external_woocommerce_id = '5217') AS obj_5217,
 (SELECT buyer_organization_id FROM orders WHERE external_woocommerce_id = '5217') AS organizace,
 (SELECT total_kc FROM orders WHERE external_woocommerce_id = '5217') AS celkem,
 (SELECT payment_status FROM orders WHERE external_woocommerce_id = '5217') AS stav_platby,
 (SELECT count(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id
   WHERE o.external_woocommerce_id = '5217') AS pocet_polozek,
 (SELECT count(*) FROM payments p JOIN orders o ON o.id = p.order_id
   WHERE o.external_woocommerce_id = '5217') AS platby;

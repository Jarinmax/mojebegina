-- KONTROLA PŘED importem objednávky WooCommerce #5217 (Perconto invest s.r.o.), jen čtení.
-- Očekáváno: 1 | 1 | 0
--   firma     firem s IČO 05249937 — MUSÍ být 1 (karta Perconto invest s.r.o.)
--   spravna   z toho firem, kde se id přesně shoduje s organization_id ze zadání
--             (3d7c57e0-510d-4cb3-8883-5662fe592a77) — MUSÍ být 1
--   obj_5217  objednávek s číslem WooCommerce 5217 v MojeBegina — MUSÍ být 0
SELECT
 (SELECT count(*) FROM organizations WHERE ico = '05249937') AS firma,
 (SELECT count(*) FROM organizations
   WHERE ico = '05249937' AND id = '3d7c57e0-510d-4cb3-8883-5662fe592a77') AS spravna,
 (SELECT count(*) FROM orders WHERE external_woocommerce_id = '5217') AS obj_5217;

-- KONTROLA PŘED importem objednávky WooCommerce #5215 Food Fest Crew (jen čtení).
-- Očekáváno po převodu leadu a migraci 60: 1 | 1 | ano | 0 | 0
--   firma            firem s IČO 08911088 — MUSÍ být 1 (vznikla převodem leadu Tomáše Herouta)
--   lead_propojeny   leadů Tomáše Herouta převedených na tuto firmu — má být 1
--   sidlo_ok         sídlo jde rozdělit na ulici, PSČ a město („Pasohlávky 251, 691 22 Pasohlávky“)
--   obj_5215         objednávek s číslem WooCommerce 5215 — MUSÍ být 0
--   faktury_firmy    vystavených faktur MojeBegina této firmě — 0 (pilot)
SELECT
 (SELECT count(*) FROM organizations WHERE ico = '08911088') AS firma,
 (SELECT count(*) FROM leads l JOIN organizations o ON o.id = l.converted_organization_id
   WHERE o.ico = '08911088' AND lower(l.contact_email) = 'tom.herout@seznam.cz') AS lead_propojeny,
 (SELECT CASE WHEN bool_and(registered_address ~ ',\s*[0-9]{3}\s?[0-9]{2}\s+\S') THEN 'ano' ELSE 'ne' END
   FROM organizations WHERE ico = '08911088') AS sidlo_ok,
 (SELECT count(*) FROM orders WHERE external_woocommerce_id = '5215') AS obj_5215,
 (SELECT count(*) FROM invoices i JOIN orders o ON o.id = i.order_id
   JOIN organizations g ON g.id = o.buyer_organization_id
   WHERE g.ico = '08911088' AND i.doc_state = 'issued') AS faktury_firmy;

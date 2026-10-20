-- KONTROLA PŘED skriptem 65 (jen čtení). Očekáváno: 1 | 1 | 0 | ano | 0 | 0
--   lead          lead Tomáše Herouta (cb5b6742…, tom.herout@seznam.cz) zatím nepřevedený — MUSÍ být 1
--   leady_email   leadů s e-mailem tom.herout@seznam.cz celkem — MUSÍ být 1 (žádný duplicitní lead)
--   firma         firem s IČO 08911088 — MUSÍ být 0 (firmu založí až skript 65)
--   dic_sloupec   migrace 60 proběhla (organizations.dic existuje)
--   obj_5215      objednávek s číslem WooCommerce 5215 — MUSÍ být 0
--   zakaznik_fak  fakturačních zákazníků s IČO 08911088 — 0 (žádný starý záznam)
SELECT
 (SELECT count(*) FROM leads WHERE id = 'cb5b6742-8031-40c9-9ac3-7456a946f061'
   AND lower(contact_email) = 'tom.herout@seznam.cz'
   AND converted_organization_id IS NULL AND stage <> 'converted') AS lead,
 (SELECT count(*) FROM leads WHERE lower(contact_email) = 'tom.herout@seznam.cz') AS leady_email,
 (SELECT count(*) FROM organizations WHERE ico = '08911088') AS firma,
 (SELECT CASE WHEN count(*) = 1 THEN 'ano' ELSE 'ne' END FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'dic') AS dic_sloupec,
 (SELECT count(*) FROM orders WHERE external_woocommerce_id = '5215') AS obj_5215,
 (SELECT count(*) FROM invoice_customers WHERE ico = '08911088') AS zakaznik_fak;

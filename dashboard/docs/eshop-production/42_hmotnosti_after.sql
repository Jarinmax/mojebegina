-- KONTROLA PO doplnění hmotností (jen čtení).
-- Očekáváno: 1 | 36 | 0 | 25 | 7 | 4 | 0
--   sloupec           1 = weight_g existuje
--   aktivni_s_hm      aktivní balení s hmotností (36)
--   aktivni_bez_hm    aktivní balení BEZ hmotnosti — MUSÍ být 0 (jinak pro ně
--                     pokladna chlazenou přepravu nenabídne)
--   g3000 / g750 / g500   počty balení 3 kg / 0,75 kg / 0,5 kg
--   jine              jiná hmotnost — MUSÍ být 0
SELECT
 (SELECT count(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'weight_g') AS sloupec,
 (SELECT count(*) FROM product_variants WHERE is_active AND weight_g IS NOT NULL) AS aktivni_s_hm,
 (SELECT count(*) FROM product_variants WHERE is_active AND weight_g IS NULL) AS aktivni_bez_hm,
 (SELECT count(*) FROM product_variants WHERE weight_g = 3000) AS g3000,
 (SELECT count(*) FROM product_variants WHERE weight_g = 750) AS g750,
 (SELECT count(*) FROM product_variants WHERE weight_g = 500) AS g500,
 (SELECT count(*) FROM product_variants WHERE weight_g NOT IN (3000, 750, 500)) AS jine;

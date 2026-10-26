-- KONTROLA PŘED doplněním hmotností balení (jen čtení). Návrh 11. 10. 2026;
-- spuštění NESCHVÁLENO. Pořadí a postup: docs/eshop-doprava/spusteni.md.
-- Očekáváno (Production 11. 10. 2026): 0 | 36 | 36 | 0
--   sloupec        0 = sloupec weight_g ještě neexistuje
--   aktivni_sku    počet aktivních balení (36)
--   ze_seznamu     kolik z 36 SKU ze skriptu 41 existuje a je aktivních — MUSÍ být 36
--   mimo_seznam    aktivní SKU, která skript 41 nezná (zůstala by bez hmotnosti
--                  → chlazená přeprava pro ně nedostupná) — má být 0
SELECT
 (SELECT count(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'weight_g') AS sloupec,
 (SELECT count(*) FROM product_variants WHERE is_active) AS aktivni_sku,
 (SELECT count(*) FROM product_variants WHERE is_active AND sku IN (
   'kulajda', 'dynova-polevka', 'gulasova-polevka-z-hlivy-ustricne', 'rajcatova-polevka',
   'rajcatova-polevka-s-cervenou-repou', 'spenatova-polevka',
   'bylinny-caj-saman-3l', 'cerny-caj-golden-nepal-3l', 'hermankovy-caj-3l', 'ibiskovy-caj-3l',
   'jasminovy-zeleny-caj-3l', 'lipovy-caj-3l', 'medunkovy-caj-s-levanduli-3l', 'zazvorovy-caj-3l',
   'bylinny-sirup-saman-3l', 'hermankovy-sirup-3l', 'ibiskovy-sirup-3l', 'lipovy-sirup-3l',
   'medunkovy-sirup-s-levanduli-3l', 'sipkovy-sirup-3l', 'zazvorovy-sirup-3l',
   'bylinny-sirup-saman-750ml', 'hermankovy-sirup-750ml', 'ibiskovy-sirup-750ml', 'lipovy-sirup-750ml',
   'medunkovy-sirup-s-levanduli-750ml', 'sipkovy-sirup-750ml', 'zazvorovy-sirup-750ml',
   'svarak-deluxe-3l', 'lady-carneval-3l', 'granatovy-bond-3l', 'kosmopolitan-3l',
   'svarak-deluxe-500ml', 'lady-carneval-500ml', 'granatovy-bond-500ml', 'kosmopolitan-500ml'
 )) AS ze_seznamu,
 (SELECT count(*) FROM product_variants WHERE is_active AND sku NOT IN (
   'kulajda', 'dynova-polevka', 'gulasova-polevka-z-hlivy-ustricne', 'rajcatova-polevka',
   'rajcatova-polevka-s-cervenou-repou', 'spenatova-polevka',
   'bylinny-caj-saman-3l', 'cerny-caj-golden-nepal-3l', 'hermankovy-caj-3l', 'ibiskovy-caj-3l',
   'jasminovy-zeleny-caj-3l', 'lipovy-caj-3l', 'medunkovy-caj-s-levanduli-3l', 'zazvorovy-caj-3l',
   'bylinny-sirup-saman-3l', 'hermankovy-sirup-3l', 'ibiskovy-sirup-3l', 'lipovy-sirup-3l',
   'medunkovy-sirup-s-levanduli-3l', 'sipkovy-sirup-3l', 'zazvorovy-sirup-3l',
   'bylinny-sirup-saman-750ml', 'hermankovy-sirup-750ml', 'ibiskovy-sirup-750ml', 'lipovy-sirup-750ml',
   'medunkovy-sirup-s-levanduli-750ml', 'sipkovy-sirup-750ml', 'zazvorovy-sirup-750ml',
   'svarak-deluxe-3l', 'lady-carneval-3l', 'granatovy-bond-3l', 'kosmopolitan-3l',
   'svarak-deluxe-500ml', 'lady-carneval-500ml', 'granatovy-bond-500ml', 'kosmopolitan-500ml'
 )) AS mimo_seznam;

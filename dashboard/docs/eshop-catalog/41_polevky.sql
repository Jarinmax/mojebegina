-- ESHOP 1.0 — katalog: Čerstvé polévky (Dýňová polévka, Kulajda, Rajčatová polévka, Rajčatová polévka s červenou řepou, Gulášová polévka z hlívy ústřičné, Špenátová polévka)
-- a společná sekce detailu polévek. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-polevky.mjs — ručně neupravovat.
-- Texty doslova z begina.cz (produktové stránky dodané vedením 3. 10.
-- 2026): popis, chuť, pro koho, balení, složení, výživa na 100 ml
-- (vč. vlákniny), skladování. Alergeny a trvanlivost web neuvádí = „Doplníme“.
-- Ostatní polévky zůstávají, jak jsou (doplní se, až budou podklady).
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou (jedna
-- transakce: chyba = nic se nezmění). Idempotentní — opakované spuštění
-- nic nezdvojí, jen přepíše texty na aktuální. Kontrola před:
-- 40_polevky_before.sql, po: 42_polevky_after.sql. Fotky jsou v kódu
-- (public/eshop/<slug>.jpg). Vrácení: 49_polevky_rollback.sql.
BEGIN;

UPDATE "product_categories" SET "detail_sections" = '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Polévky Begina jsou praktické řešení pro:","Stačí ohřát a podávat. Díky bag-in-box balení lze polévku jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, "updated_at" = now()
WHERE "slug" = 'polevky';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'dynova-polevka', 'Dýňová polévka',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Dýňová polévka s kokosovým mlékem stojí na plném a výrazném základu kvalitní dýně. Krémová struktura, jemnost kokosového mléka a pečlivě zvolené koření vytvářejí harmonickou chuť s přirozeně bohatým charakterem.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky krémových zeleninových polévek', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Základ tvoří kvalitní dýně, kterou doplňují brambory a pečlivě zvolené koření. Kokosové mléko zjemňuje strukturu a dodává krémovost. Chuť je vyvážená, plná a přirozeně harmonická.', 'čistá filtrovaná voda, dýně Hokkaido 39 %, kokosové mléko 15 % (kokosový extrakt 70 %, voda, emulgátor E435), brambory 9 %, cibule 4 %, olivový olej, dýňový olej, petržel kořen, mořská sůl, třtinový cukr, zázvor, lahůdkové droždí, grepová šťáva, chilli, muškátový oříšek, hřebíček, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":283,"energy_kcal":68,"fat":4,"saturates":2.7,"carbohydrate":7.6,"sugars":2,"protein":1,"salt":0.8,"fibre":1.1}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka'), 'dynova-polevka', '3 l Rodinná zásoba (bag-in-box)', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/dynova-polevka.jpg', 'Dýňová polévka', 0 FROM "products" WHERE "slug" = 'dynova-polevka'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'dynova-polevka' AND pi."url" = '/eshop/dynova-polevka.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'kulajda', 'Kulajda',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Kulajda stojí na plném základu brambor a žampionů. Čerstvý kopr a vyvážené koření vytvářejí harmonickou chuť s čistým charakterem.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky krémových polévek s vyváženým charakterem', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Základ tvoří brambory a žampiony, které dávají polévce plnost a hloubku. Čerstvý kopr dodává typický bylinný akcent a podtrhuje charakter celé receptury. Struktura je krémová, chuť vyvážená a přirozeně plná.', 'čistá filtrovaná voda, brambory 20 %, kokosové mléko 15 % (kokosový extrakt 70 %, voda, emulgátor E435), žampiony 7 %, cibule 3 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":187,"energy_kcal":45,"fat":2.9,"saturates":2.6,"carbohydrate":4.1,"sugars":0.5,"protein":0.7,"salt":0.7,"fibre":0.5}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'kulajda'), 'kulajda', '3 l Rodinná zásoba (bag-in-box)', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/kulajda.jpg', 'Kulajda', 0 FROM "products" WHERE "slug" = 'kulajda'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'kulajda' AND pi."url" = '/eshop/kulajda.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'rajcatova-polevka', 'Rajčatová polévka',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Rajčatová polévka nabízí plnou chuť zralých rajčat, vyvážené koření a jemně krémovou strukturu.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky rajčatových polévek', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Základ tvoří kvalitní rajčata, která dávají polévce výraz a hloubku. Pečlivě zvolené koření doplňuje celkovou harmonii a podtrhuje plnost chuti. Struktura je jemná, chuť vyvážená a přirozeně plná.', 'čistá filtrovaná voda, pasírovaná rajčata 27 %, rajčatový protlak 7 %, brambory 7 %, kokosové mléko 7 % (kokosový extrakt 70 %, voda, emulgátor E435), cibule 5 %, petržel kořen, olivový olej, třtinový cukr, mořská sůl, česnek, libeček, pepř černý, kardamom, hřebíček, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":255,"energy_kcal":61,"fat":4.4,"saturates":1.6,"carbohydrate":5.1,"sugars":1.6,"protein":0.9,"salt":0.8,"fibre":0.7}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka'), 'rajcatova-polevka', '3 l Rodinná zásoba (bag-in-box)', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/rajcatova-polevka.jpg', 'Rajčatová polévka', 0 FROM "products" WHERE "slug" = 'rajcatova-polevka'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'rajcatova-polevka' AND pi."url" = '/eshop/rajcatova-polevka.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'rajcatova-polevka-s-cervenou-repou', 'Rajčatová polévka s červenou řepou',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Rajčatová polévka s červenou řepou nabízí jemnou a přirozeně vyváženou chuť. Zralá rajčata tvoří výrazný základ, který červená řepa přirozeně zjemňuje a propojuje do hladkého celku.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky jemnějších rajčatových polévek', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Je jemná, kulatá a vyvážená. Rajčatový základ doplňuje červená řepa, která chuť přirozeně uhlazuje a propojuje do hladkého celku. Výsledkem je hebká struktura a příjemně plný charakter.', 'čistá filtrovaná voda, pasírovaná rajčata 17 %, brambory 13 %, kokosové mléko 13 % (kokosový extrakt 70 %, voda, emulgátor E435), červená řepa 9 %, rajčatový protlak 3 %, cibule, petržel kořen, mořská sůl, třtinový cukr, olivový olej, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":189,"energy_kcal":45,"fat":2.9,"saturates":2.4,"carbohydrate":3.9,"sugars":2.6,"protein":0.9,"salt":0.8,"fibre":0.9}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], 35)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou'), 'rajcatova-polevka-s-cervenou-repou', '3 l Rodinná zásoba (bag-in-box)', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/rajcatova-polevka-s-cervenou-repou.jpg', 'Rajčatová polévka s červenou řepou', 0 FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'rajcatova-polevka-s-cervenou-repou' AND pi."url" = '/eshop/rajcatova-polevka-s-cervenou-repou.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'gulasova-polevka-z-hlivy-ustricne', 'Gulášová polévka z hlívy ústřičné',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Gulášová polévka z hlívy ústřičné nabízí výraznou a plnou chuť. Hlíva dodává pevnou strukturu, rajčatový základ hloubku a uzená paprika charakteristickou intenzitu.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky výrazných a sytějších chutí', '- pro ty, kteří hledají gulášovou polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro vegany i vegetariány', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Má plnou a sytou chuť s výrazem uzené papriky a rajčatového základu. Hlíva ústřičná dodává přirozenou strukturu a vytváří harmonický celek. Chuť je koncentrovaná, vyvážená a příjemně zahřívací.', 'čistá filtrovaná voda, brambory 22 %, hlíva ústřičná (Pleurotus ostreatus) 8 %, cibule 5 %, rajčatový protlak 4 %, mořská sůl, dýňový olej, česnek, olivový olej, majoránka, kmín, lahůdkové droždí, paprika uzená, paprika sladká, chilli, pepř černý, skořice', '{"energy_kj":149,"energy_kcal":36,"fat":0.7,"saturates":0.1,"carbohydrate":5.4,"sugars":1.7,"protein":1.2,"salt":0.8,"fibre":1.1}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], 40)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne'), 'gulasova-polevka-z-hlivy-ustricne', '3 l Rodinná zásoba (bag-in-box)', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/gulasova-polevka-z-hlivy-ustricne.jpg', 'Gulášová polévka z hlívy ústřičné', 0 FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'gulasova-polevka-z-hlivy-ustricne' AND pi."url" = '/eshop/gulasova-polevka-z-hlivy-ustricne.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'spenatova-polevka', 'Špenátová polévka',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Špenátová polévka nabízí jemně krémovou a přirozeně plnou chuť. Kvalitní špenát tvoří její výrazný základ, který doplňuje jemná struktura a vyvážené koření.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky zeleninových krémových polévek', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Špenát tvoří výrazný zeleninový základ, který doplňují brambory a pečlivě zvolené koření. Struktura je krémová, chuť vyvážená a čistá. Polévka působí svěže a harmonicky.', 'čistá filtrovaná voda, špenát 17 %, kokosové mléko 15 % (70 % kokosový extrakt, voda, emulgátor E435), brambory 13 %, cibule 4 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":210,"energy_kcal":50,"fat":3.2,"saturates":1.7,"carbohydrate":4.1,"sugars":0.7,"protein":1.1,"salt":0.7,"fibre":0.8}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], 50)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'spenatova-polevka'), 'spenatova-polevka', '3 l Rodinná zásoba (bag-in-box)', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/spenatova-polevka.jpg', 'Špenátová polévka', 0 FROM "products" WHERE "slug" = 'spenatova-polevka'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'spenatova-polevka' AND pi."url" = '/eshop/spenatova-polevka.jpg');

COMMIT;

-- ESHOP 1.0 — katalog: Čaje (Bylinný čaj Šaman, Zázvorový čaj, Lipový čaj, Heřmánkový čaj, Černý čaj Golden Nepal)
-- a společná sekce detailu čajů. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-caje.mjs — ručně neupravovat.
-- Texty doslova z begina.cz (produktové stránky dodané vedením 3. 10.
-- 2026): popis, chuť, balení, složení, výživa na 100 ml, skladování,
-- upozornění; alergeny (žádné) a trvanlivost 2 měsíce od vedení.
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou (jedna
-- transakce: chyba = nic se nezmění). Idempotentní — opakované spuštění
-- nic nezdvojí, jen přepíše texty na aktuální. Kontrola před:
-- 50_caje_before.sql, po: 52_caje_after.sql. Fotky jsou v kódu
-- (public/eshop/<slug>.jpg). Vrácení: 59_caje_rollback.sql.
BEGIN;

UPDATE "product_categories" SET "intro" = ARRAY['Čaje Begina jsou hotové nápoje připravené z kvalitních bylin a pečlivě vybraných surovin na základě čisté filtrované vody.', 'Každá receptura je navržena tak, aby nabízela plnou, vyváženou chuť bez nutnosti další úpravy. Stačí nalít, vychutnat horké nebo ledové a nechat vyniknout jejich přirozenou hloubku a harmonii.']::text[],
  "detail_sections" = '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Čaje Begina jsou praktické řešení pro:","Díky bag-in-box balení lze nápoj jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, "updated_at" = now()
WHERE "slug" = 'caje';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'caje'), 'bylinny-caj-saman', 'Bylinný čaj Šaman',
  'Až 12 nápojů (24,10 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Bylinný čaj Šaman spojuje zemitou hloubku šípku a čagy s jemnou energií ženšenu a hřejivým tónem zázvoru. Výsledkem je harmonická, plná chuť s dlouhým dozvukem.', 'Chuť působí klidně, vyrovnaně a soustředěně.', '**Prémiový bylinný čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'hluboká, vyvážená chuť']::text[],
  'Bylinný čaj Šaman má plnou, harmonickou chuť s výraznou hloubkou. V úvodu se objevuje jemná ovocnost šípku, která přechází do zemitých tónů čagy a ženšenu. Závěr doplňuje hřejivý nádech zázvoru, který chuť uzavírá do vyváženého, soustředěného celku.', 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, šípek (Rosa canina), čaga (Inonotus obliquus), ženšen pravý (Panax ginseng), zázvor (Zingiber officinale), regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":98,"energy_kcal":23,"fat":0,"saturates":0,"carbohydrate":5.7,"sugars":5.7,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', ARRAY['Není vhodné pro děti do 3 let, těhotné a kojící ženy.']::text[], '{}'::text[], 60, 'Do 2 měsíců při skladování v lednici do 4 °C.', 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'bylinny-caj-saman'), 'bylinny-caj-saman-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 289, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/bylinny-caj-saman.jpg', 'Bylinný čaj Šaman', 0 FROM "products" WHERE "slug" = 'bylinny-caj-saman'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'bylinny-caj-saman' AND pi."url" = '/eshop/bylinny-caj-saman.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'caje'), 'zazvorovy-caj', 'Zázvorový čaj',
  'Až 12 nápojů (20,80 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Zázvorový čaj spojuje výraznou chuť zázvoru se svěžím nádechem citronu a jemně vyváženým profilem.', 'Výsledkem je plná, čistá chuť s příjemně osvěžujícím dojmem.', '**Čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'výrazná, plná chuť']::text[],
  'Výrazná chuť zázvoru se svěžím nádechem citronu působí vyváženě a příjemně zahřívajícím dojmem.', 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, zázvor (Zingiber officinale), regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":94,"energy_kcal":22,"fat":0,"saturates":0,"carbohydrate":5.6,"sugars":5.6,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 60, 'Do 2 měsíců při skladování v lednici do 4 °C.', 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-caj'), 'zazvorovy-caj-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 249, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/zazvorovy-caj.jpg', 'Zázvorový čaj', 0 FROM "products" WHERE "slug" = 'zazvorovy-caj'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'zazvorovy-caj' AND pi."url" = '/eshop/zazvorovy-caj.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'caje'), 'lipovy-caj', 'Lipový čaj',
  'Až 12 nápojů (21,60 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Lipový čaj přináší jemnou a harmonickou chuť lipového květu s lehce nasládlým charakterem a příjemně hladkým dozvukem. Výsledkem je plná, čistá chuť s jemným květinovým charakterem a přirozenou lehkostí.', 'Chuť působí jemně, hladce a harmonicky.', '**Bylinný čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'čistá, vyvážená chuť']::text[],
  'Lipový čaj má jemnou, hladkou chuť s lehce nasládlým charakterem a typickým květinovým nádechem. Chuť působí čistě, vyváženě a harmonicky.', 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, lipový květ (Tiliae flos), regulátor kyselosti: kyselina citronová; antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":94,"energy_kcal":22,"fat":0,"saturates":0,"carbohydrate":5.6,"sugars":5.6,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 60, 'Do 2 měsíců při skladování v lednici do 4 °C.', 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'lipovy-caj'), 'lipovy-caj-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 259, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'caje'), 'hermankovy-caj', 'Heřmánkový čaj',
  'Až 12 nápojů (20,80 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Heřmánkový čaj přináší jemnou a harmonickou chuť heřmánku s lehce nasládlým charakterem a příjemně hladkým dozvukem.', 'Chuť působí lehce, čistě a harmonicky.', '**Bylinný čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'jemná, vyvážená chuť']::text[],
  'Heřmánkový čaj má jemnou, hladkou chuť s lehce nasládlým charakterem a příjemně uklidňujícím dozvukem. Chuť působí čistě, vyváženě a harmonicky.', 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, květ heřmánku (Matricaria chamomilla), regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":94,"energy_kcal":22,"fat":0,"saturates":0,"carbohydrate":5.6,"sugars":5.6,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 60, 'Do 2 měsíců při skladování v lednici do 4 °C.', 40)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-caj'), 'hermankovy-caj-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 249, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/hermankovy-caj.jpg', 'Heřmánkový čaj', 0 FROM "products" WHERE "slug" = 'hermankovy-caj'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'hermankovy-caj' AND pi."url" = '/eshop/hermankovy-caj.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'caje'), 'cerny-caj-golden-nepal', 'Černý čaj Golden Nepal',
  'Až 12 nápojů (22,40 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Černý čaj Golden Nepal přináší plnou a elegantní chuť čaje z podhůří Himálaje se svěžím nádechem citronu a přirozenou hloubkou.', 'Chuť působí vyváženě, hladce a harmonicky.', '**Černý čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'plná, vyvážená chuť']::text[],
  'Plná a výrazná chuť černého čaje Golden Nepal se svěží citronovou jiskrou působí vyváženě a příjemně osvěžujícím dojmem.', 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, černý čaj Golden Nepal (Camellia assamica), regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":94,"energy_kcal":22,"fat":0,"saturates":0,"carbohydrate":5.6,"sugars":5.6,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', ARRAY['Obsahuje kofein – není vhodné pro děti, těhotné a kojící ženy.']::text[], '{}'::text[], 60, 'Do 2 měsíců při skladování v lednici do 4 °C.', 50)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'cerny-caj-golden-nepal'), 'cerny-caj-golden-nepal-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 269, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/cerny-caj-golden-nepal.jpg', 'Černý čaj Golden Nepal', 0 FROM "products" WHERE "slug" = 'cerny-caj-golden-nepal'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'cerny-caj-golden-nepal' AND pi."url" = '/eshop/cerny-caj-golden-nepal.jpg');

COMMIT;

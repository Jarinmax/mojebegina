-- ESHOP 1.0 — katalog: Čerstvé polévky (Dýňová polévka, Kulajda, Tomatová polévka, Rajčatová polévka s červenou řepou, Gulášová polévka z hlívy ústřičné, Špenátová polévka)
-- a společná sekce detailu polévek. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-polevky.mjs — ručně neupravovat.
-- Texty doslova z begina.cz (produktové stránky dodané vedením 3. 10.
-- 2026): popis, chuť, pro koho, balení, složení, výživa na 100 ml
-- (vč. vlákniny), skladování; alergeny (žádné) a trvanlivost 14 dnů od vedení.
-- Ostatní polévky zůstávají, jak jsou (doplní se, až budou podklady).
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou (jedna
-- transakce: chyba = nic se nezmění). Idempotentní — opakované spuštění
-- nic nezdvojí, jen přepíše texty na aktuální. Kontrola před:
-- 40_polevky_before.sql, po: 42_polevky_after.sql. Fotky jsou v kódu
-- (public/eshop/polevky/<slug>-miska.jpg a -sacek.jpg). Vrácení: 49_polevky_rollback.sql.
BEGIN;

UPDATE "product_categories" SET "intro" = ARRAY['Čerstvé polévky Begina vaříme z čisté filtrované vody, zeleniny, hub, bylinek a koření. Všechny připravujeme z rostlinných surovin, bez masa a mléčných výrobků. Každá receptura má svou vlastní chuť — od jemných zeleninových krémů po výraznou gulášovou z hlívy ústřičné.', 'Dobrou polévku si můžete dopřát i ve dnech, kdy na vaření nezbývá čas. Stačí ohřát a podávat doma, v práci nebo u společného stolu.', 'Z třílitrového balení s kohoutkem odeberete právě tolik, kolik potřebujete. Zbytek uložíte do chladničky a další porci máte po ruce. Méně času u plotny, více času pro Vás.']::text[],
  "detail_sections" = '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Polévky Begina jsou praktické řešení pro:","Stačí ohřát a podávat. Díky bag-in-box balení lze polévku jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, "updated_at" = now()
WHERE "slug" = 'polevky';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'dynova-polevka', 'Dýňová polévka',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Naše nejprodávanější polévka. Dýně je v ní 41 % a kokosové mléko ji zjemňuje. Zázvor, chilli, muškátový oříšek a hřebíček jí dodávají výraznou, zajímavou chuť.', '**Natočte si z kohoutku, ohřejte a je hotovo.**', '## Pro koho je vhodná', '- pro ty, kdo chtějí dýňovou s charakterem', '- pro vegany a vegetariány', '- na rychlý oběd doma i v práci']::text[], ARRAY['rostlinná receptura', 'z čisté filtrované vody']::text[],
  'Krémová a plná, s kořeněným dozvukem, který příjemně prohřeje. Tip: opražená dýňová semínka nebo kapka dýňového oleje.', 'dýně 41 %, čistá filtrovaná voda, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 10 %, cibule 5 %, kořen petržele, olivový olej, dýňový olej, mořská sůl, třtinový cukr, grapefruitová šťáva, lahůdkové droždí, sušený mletý zázvor, chilli, muškátový oříšek, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":250,"energy_kcal":60,"fat":3.9,"saturates":2.5,"carbohydrate":4.7,"sugars":3.1,"protein":1,"salt":0.78}'::jsonb, '100ml', 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', '{}'::text[], '{}'::text[], 14, 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka'), 'dynova-polevka', '3 l', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka') AND "url" NOT IN ('/eshop/polevky/dynova-polevka-miska.jpg', '/eshop/polevky/dynova-polevka-sacek.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka'), '/eshop/polevky/dynova-polevka-miska.jpg', 'Dýňová polévka', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka') AND "url" = '/eshop/polevky/dynova-polevka-miska.jpg');
UPDATE "product_images" SET "alt" = 'Dýňová polévka', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka') AND "url" = '/eshop/polevky/dynova-polevka-miska.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka'), '/eshop/polevky/dynova-polevka-sacek.jpg', 'Dýňová polévka v balení s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka') AND "url" = '/eshop/polevky/dynova-polevka-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Dýňová polévka v balení s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'dynova-polevka') AND "url" = '/eshop/polevky/dynova-polevka-sacek.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'kulajda', 'Kulajda',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Krémová kulajda plná brambor a žampionů, provoněná koprem.', '**Natočte si z kohoutku, ohřejte a je hotovo.**', '## Pro koho je vhodná', '- pro milovníky kulajdy', '- pro vegany a vegetariány', '- na rychlý oběd doma i v práci']::text[], ARRAY['rostlinná receptura', 'z čisté filtrované vody']::text[],
  'Hebká a sytá. Voní po houbách a kopru, česnek a kmín ji doladí. Tip: čerstvý chléb.', 'čistá filtrovaná voda, brambory 22 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), žampiony 7 %, cibule 5 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":219,"energy_kcal":53,"fat":3.5,"saturates":2.4,"carbohydrate":3.9,"sugars":0.8,"protein":1,"salt":0.76}'::jsonb, '100ml', 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', '{}'::text[], '{}'::text[], 14, 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'kulajda'), 'kulajda', '3 l', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'kulajda') AND "url" NOT IN ('/eshop/polevky/kulajda-miska.jpg', '/eshop/polevky/kulajda-sacek.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'kulajda'), '/eshop/polevky/kulajda-miska.jpg', 'Kulajda', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'kulajda') AND "url" = '/eshop/polevky/kulajda-miska.jpg');
UPDATE "product_images" SET "alt" = 'Kulajda', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'kulajda') AND "url" = '/eshop/polevky/kulajda-miska.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'kulajda'), '/eshop/polevky/kulajda-sacek.jpg', 'Kulajda v balení s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'kulajda') AND "url" = '/eshop/polevky/kulajda-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Kulajda v balení s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'kulajda') AND "url" = '/eshop/polevky/kulajda-sacek.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'rajcatova-polevka', 'Tomatová polévka',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Poctivá rajská, ve které je rajčat přes třetinu. Kokosové mléko ji zjemní, libeček, kardamom a hřebíček jí dávají vlastní vůni.', '**Natočte si z kohoutku, ohřejte a je hotovo.**', '## Pro koho je vhodná', '- pro milovníky rajské', '- pro vegany a vegetariány', '- na rychlý oběd doma i v práci']::text[], ARRAY['rostlinná receptura', 'z čisté filtrované vody']::text[],
  'Výrazně rajčatová, lehce nasládlá, s kořeněnou vůní. Tip: krutony, rýže nebo čerstvá bazalka.', 'čistá filtrovaná voda, pasírovaná rajčata 27 % (rajčata 99,9 %, regulátor kyselosti: kyselina citronová), rajčatový protlak 7 % (rajčatový protlak, jedlá sůl 1 %), brambory 7 %, kokosové mléko 6 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), cibule 5 %, kořen petržele, olivový olej, třtinový cukr, mořská sůl, česnek, libeček, černý pepř, kardamom, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":229,"energy_kcal":54,"fat":2.9,"saturates":1.3,"carbohydrate":5.5,"sugars":4.4,"protein":1.2,"salt":0.86}'::jsonb, '100ml', 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', '{}'::text[], '{}'::text[], 14, 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka'), 'rajcatova-polevka', '3 l', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka') AND "url" NOT IN ('/eshop/polevky/rajcatova-polevka-miska.jpg', '/eshop/polevky/rajcatova-polevka-sacek.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka'), '/eshop/polevky/rajcatova-polevka-miska.jpg', 'Tomatová polévka', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka') AND "url" = '/eshop/polevky/rajcatova-polevka-miska.jpg');
UPDATE "product_images" SET "alt" = 'Tomatová polévka', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka') AND "url" = '/eshop/polevky/rajcatova-polevka-miska.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka'), '/eshop/polevky/rajcatova-polevka-sacek.jpg', 'Tomatová polévka v balení s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka') AND "url" = '/eshop/polevky/rajcatova-polevka-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Tomatová polévka v balení s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka') AND "url" = '/eshop/polevky/rajcatova-polevka-sacek.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'rajcatova-polevka-s-cervenou-repou', 'Rajčatová polévka s červenou řepou',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Jemná rajčatová polévka, které červená řepa dává sladší chuť a sytou barvu. Brambory a kokosové mléko ji dělají krémovou.', '**Natočte si z kohoutku, ohřejte a je hotovo.**', '## Pro koho je vhodná', '- pro ty, kdo mají rádi jemné krémové polévky', '- pro vegany a vegetariány', '- na rychlý oběd doma i v práci']::text[], ARRAY['rostlinná receptura', 'z čisté filtrované vody']::text[],
  'Hladká a krémová, jemnější a kulatější než klasická rajská.', 'čistá filtrovaná voda, pasírovaná rajčata 17 % (rajčata 99,9 %, regulátor kyselosti: kyselina citronová), brambory 14 %, kokosové mléko 12 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), červená řepa 9 %, cibule 5 %, rajčatový protlak 3 % (rajčatový protlak, jedlá sůl 1 %), kořen petržele, olivový olej, mořská sůl, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":219,"energy_kcal":52,"fat":2.8,"saturates":2.1,"carbohydrate":5.1,"sugars":3.1,"protein":1.1,"salt":0.84}'::jsonb, '100ml', 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', '{}'::text[], '{}'::text[], 14, 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 35)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou'), 'rajcatova-polevka-s-cervenou-repou', '3 l', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou') AND "url" NOT IN ('/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska.jpg', '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-sacek.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou'), '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska.jpg', 'Rajčatová polévka s červenou řepou', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou') AND "url" = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska.jpg');
UPDATE "product_images" SET "alt" = 'Rajčatová polévka s červenou řepou', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou') AND "url" = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou'), '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-sacek.jpg', 'Rajčatová polévka s červenou řepou v balení s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou') AND "url" = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Rajčatová polévka s červenou řepou v balení s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'rajcatova-polevka-s-cervenou-repou') AND "url" = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-sacek.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'gulasova-polevka-z-hlivy-ustricne', 'Gulášová polévka z hlívy ústřičné',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Sytá, lehce pikantní gulášová polévka. Plnou chuť jí dává hlíva ústřičná, uzená paprika, majoránka a kmín.', '**Natočte si z kohoutku, ohřejte a je hotovo.**', '## Pro koho je vhodná', '- pro ty, kdo chtějí gulášovou bez masa', '- pro vegany a vegetariány', '- když chcete polévku, která zasytí']::text[], ARRAY['rostlinná receptura', 'z čisté filtrované vody']::text[],
  'Výrazná a lehce pikantní, voní po uzené paprice, česneku a majoránce. Zahřeje a zasytí. Tip: čerstvý chléb.', 'čistá filtrovaná voda, brambory 19 %, hlíva ústřičná (Pleurotus ostreatus) 7 %, cibule 4 %, rajčatový protlak 3 % (rajčatový protlak, jedlá sůl 1 %), mořská sůl, dýňový olej, česnek, olivový olej, majoránka, kmín, lahůdkové droždí, uzená paprika, sladká paprika, chilli, černý pepř, antioxidant: kyselina askorbová (vitamin C), skořice', '{"energy_kj":125,"energy_kcal":30,"fat":0.9,"saturates":0.1,"carbohydrate":4,"sugars":1.1,"protein":0.9,"salt":0.82}'::jsonb, '100ml', 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', '{}'::text[], '{}'::text[], 14, 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 40)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne'), 'gulasova-polevka-z-hlivy-ustricne', '3 l', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne') AND "url" NOT IN ('/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska.jpg', '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-sacek.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne'), '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska.jpg', 'Gulášová polévka z hlívy ústřičné', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne') AND "url" = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska.jpg');
UPDATE "product_images" SET "alt" = 'Gulášová polévka z hlívy ústřičné', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne') AND "url" = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne'), '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-sacek.jpg', 'Gulášová polévka z hlívy ústřičné v balení s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne') AND "url" = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Gulášová polévka z hlívy ústřičné v balení s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'gulasova-polevka-z-hlivy-ustricne') AND "url" = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-sacek.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'spenatova-polevka', 'Špenátová polévka',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Lahodná špenátová polévka s bramborami a kokosovým mlékem, dochucená česnekem a majoránkou.', '**Natočte si z kohoutku, ohřejte a je hotovo.**', '## Pro koho je vhodná', '- pro milovníky špenátu s česnekem', '- pro vegany a vegetariány', '- na rychlý oběd doma i v práci']::text[], ARRAY['rostlinná receptura', 'z čisté filtrované vody']::text[],
  'Krémová a špenátová, s česnekem v pozadí. Tip: krutony.', 'čistá filtrovaná voda, špenát 17 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 14 %, cibule 4 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":199,"energy_kcal":48,"fat":3.4,"saturates":2.4,"carbohydrate":2.7,"sugars":0.7,"protein":1.1,"salt":0.76}'::jsonb, '100ml', 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', '{}'::text[], '{}'::text[], 14, 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 50)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'spenatova-polevka'), 'spenatova-polevka', '3 l', 'Rodinné balení vhodné na několik obědů nebo večeří.',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.', 3000, 12, 379, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'spenatova-polevka') AND "url" NOT IN ('/eshop/polevky/spenatova-polevka-miska.jpg', '/eshop/polevky/spenatova-polevka-sacek.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'spenatova-polevka'), '/eshop/polevky/spenatova-polevka-miska.jpg', 'Špenátová polévka', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'spenatova-polevka') AND "url" = '/eshop/polevky/spenatova-polevka-miska.jpg');
UPDATE "product_images" SET "alt" = 'Špenátová polévka', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'spenatova-polevka') AND "url" = '/eshop/polevky/spenatova-polevka-miska.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'spenatova-polevka'), '/eshop/polevky/spenatova-polevka-sacek.jpg', 'Špenátová polévka v balení s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'spenatova-polevka') AND "url" = '/eshop/polevky/spenatova-polevka-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Špenátová polévka v balení s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'spenatova-polevka') AND "url" = '/eshop/polevky/spenatova-polevka-sacek.jpg';

UPDATE "product_categories" SET "image_url" = '/eshop/polevky/dynova-polevka-miska.jpg', "updated_at" = now() WHERE "slug" = 'polevky';

COMMIT;

-- ESHOP — katalog: Ovocné nápoje (Červánkové nebe, Dům u jezera, Malinový svařák – nealko).
-- VYGENEROVÁNO skriptem scripts/eshop-catalog/build-ovocne-napoje.mjs — ručně neupravovat.
-- Texty, ceny, složení, výživa na 100 ml a skladování doslova z begina.cz
-- (WooCommerce, 10. 10. 2026). Alergeny a trvanlivost begina.cz neuvádí →
-- NULL (neověřeno).
--
-- Produkty vzniknou SKRYTÉ (is_active = false): na webu nejsou a nejdou
-- objednat. Kategorie se nemění. Zveřejnění: 73_ovocne_napoje_zverejneni.sql
-- (jen s ověřenými alergeny). Idempotentní; spouští se CELÝ soubor najednou.
-- Kontrola před: 70_ovocne_napoje_before.sql, po: 72_ovocne_napoje_after.sql.
BEGIN;

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "is_active", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'ovocne-napoje'), 'cervankove-nebe', 'Červánkové nebe',
  'Až 12 nápojů (29 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Jablečno-malinový nápoj Červánkové nebe propojuje plnost ovoce s jemným citrusovým akcentem. Chuť je šťavnatá, harmonická a krásně vyvážená – s lehkostí, ke které se rádi vracíte.', '**Prémiový nápoj, který máte v lednici vždy připravený. Stačí podávat vychlazený.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.', '## Moderní alternativa limonád', 'Jablečno-malinový nápoj Červánkové nebe představuje lehkou a moderní alternativu klasických sladkých limonád. Spojuje přirozenou ovocnou plnost s jemnou svěžestí a působí vyváženě a kultivovaně.', 'Je ideální pro každodenní osvěžení i slavnostní příležitosti. Díky různým velikostem balení se hodí jak pro jednotlivce, tak pro rodinné posezení nebo větší setkání s přáteli.', '## Pro koho je vhodný', '- pro ty, kdo mají rádi šťavnatou a přirozeně ovocnou chuť', '- jako lehké osvěžení během dne', '- k posezení s přáteli', '- jako základ pro míchané nápoje']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'vyvážená, přirozená chuť']::text[],
  'Jablečno-malinový nápoj Červánkové nebe má šťavnatý, harmonický charakter. Jablečno-malinová plnost se přirozeně propojuje s jemnou citrusovou linkou a vytváří hladký, vyvážený dojem. Chuť je kulatá, ovocně hluboká a mimořádně pitelná. Je to ten typ nápoje, který si nalijete znovu dřív, než si uvědomíte, že sklenka je prázdná.', 'čistá filtrovaná voda, jablečno-malinová šťáva 34 % (jablečná šťáva 85 %, malinová šťáva 15 %), citronová šťáva 1 %, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":69,"energy_kcal":16,"fat":0,"saturates":0,"carbohydrate":3.9,"sugars":3.6,"protein":0.1,"salt":0}'::jsonb, '100ml', 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření. Před použitím protřepejte, usazenina z ovoce je přirozená. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena – vadu zjištěnou při převzetí nám prosím ohlaste ihned, ideálně s fotografií.', '{}'::text[], 'Neotevřené balení spotřebujte do data uvedeného na obalu (14 dnů od výroby). Po otevření spotřebujte do 5 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', false, 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'cervankove-nebe'), 'cervankove-nebe-3l', '3 l', 'Ideální pro sdílení nebo více příležitostí.',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.', 3000, 12, 349, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/cervankove-nebe.jpg', 'Červánkové nebe', 0 FROM "products" WHERE "slug" = 'cervankove-nebe'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'cervankove-nebe' AND pi."url" = '/eshop/cervankove-nebe.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "is_active", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'ovocne-napoje'), 'dum-u-jezera', 'Dům u jezera',
  'Až 12 nápojů (29 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Grepový nápoj Dům u jezera spojuje výraznou citrusovou svěžest s jemnou jablečnou plností. Výsledkem je harmonická chuť, která připomíná letní střik nebo dobře vychlazenou sklenku vína.', '**Prémiový nápoj, který máte v lednici vždy připravený. Stačí podávat vychlazený.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.', '## Moderní alternativa limonád', 'Grepový nápoj Dům u jezera představuje lehkou a moderní alternativu klasických sladkých limonád. Spojuje výraznou grepovou svěžest s jemnou jablečnou plností a působí vyváženě a přirozeně.', 'Je ideální pro každodenní osvěžení i slavnostní příležitosti. Díky různým velikostem balení se hodí jak pro jednotlivce, tak pro rodinné posezení nebo větší setkání s přáteli.', '## Pro koho je vhodný', '- pro ty, kdo mají rádi svěží a výraznější chuť', '- jako lehké osvěžení během dne', '- k posezení s přáteli', '- jako základ pro míchané nápoje']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'vyvážená, přirozená chuť']::text[],
  'Grepový nápoj dům u jezera má výrazný, osvěžující charakter. Grepová svěžest se přirozeně propojuje s jemnou jablečnou plností a vytváří lehký, čistý dojem. Chuť připomíná letní střik nebo dobře vychlazenou sklenku vína a působí svěže a energicky.', 'čistá filtrovaná voda, grepová šťáva 14 %, jablečná šťáva 14 %, citronová šťáva 4 %, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":52,"energy_kcal":12,"fat":0,"saturates":0,"carbohydrate":2.8,"sugars":2.7,"protein":0.1,"salt":0}'::jsonb, '100ml', 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření. Před použitím protřepejte, usazenina z ovoce je přirozená. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena – vadu zjištěnou při převzetí nám prosím ohlaste ihned, ideálně s fotografií.', '{}'::text[], 'Neotevřené balení spotřebujte do data uvedeného na obalu (14 dnů od výroby). Po otevření spotřebujte do 5 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', false, 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'dum-u-jezera'), 'dum-u-jezera-3l', '3 l', 'Ideální pro sdílení nebo více příležitostí.',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.', 3000, 12, 349, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/dum-u-jezera.jpg', 'Dům u jezera', 0 FROM "products" WHERE "slug" = 'dum-u-jezera'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'dum-u-jezera' AND pi."url" = '/eshop/dum-u-jezera.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "is_active", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'ovocne-napoje'), 'malinovy-svarak-nealko', 'Malinový svařák – nealko',
  'Až 15 nápojů (26,60 Kč za nápoj). Jeden nápoj = 200 ml.', ARRAY['Malinový svařák nealko v sobě spojuje jemnost ovocných tónů s hloubkou tradičního koření. Sladké maliny a jablka se prolínají s nádechem pomeranče, zatímco hřebíček, skořice a badyán dodávají nápoji jeho charakteristickou, harmonickou chuť.', 'Ideální pro klidné večery, zimní atmosféru i chvíle, kdy si chcete dopřát něco výjimečného.', '**Prémiový nápoj, který máte v lednici vždy připravený. Stačí jemně ohřát nebo podávat vychlazený.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechá vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'vyvážená, plná chuť']::text[],
  'Malinový svařák nealko má jemně ovocný, plný a hřejivý charakter. Sladké maliny a jablka se přirozeně doplňují s citrusovým tónem pomeranče, zatímco hřebíček, skořice a badyán dodávají nápoji jeho typickou, příjemně kořeněnou hloubku. Chuť je harmonická, vyvážená a působí příjemným a hřejivým dojmem.', 'jablečno-malinová šťáva 51 % (jablečná šťáva 85 %, malinová šťáva 15 %), čistá filtrovaná voda, pomerančová šťáva 7 %, hřebíček, skořice, badyán, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":115,"energy_kcal":27,"fat":0,"saturates":0,"carbohydrate":6.5,"sugars":6,"protein":0.2,"salt":0}'::jsonb, '100ml', 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření. Před použitím protřepejte, usazenina z ovoce je přirozená. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena – vadu zjištěnou při převzetí nám prosím ohlaste ihned, ideálně s fotografií.', '{}'::text[], 'Neotevřené balení spotřebujte do data uvedeného na obalu (14 dnů od výroby). Po otevření spotřebujte do 5 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', false, 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'malinovy-svarak-nealko'), 'malinovy-svarak-nealko-3l', '3 l', 'Ideální pro sdílení nebo více příležitostí.',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.', 3000, 15, 399, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/malinovy-svarak-nealko.jpg', 'Malinový svařák – nealko', 0 FROM "products" WHERE "slug" = 'malinovy-svarak-nealko'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'malinovy-svarak-nealko' AND pi."url" = '/eshop/malinovy-svarak-nealko.jpg');

COMMIT;

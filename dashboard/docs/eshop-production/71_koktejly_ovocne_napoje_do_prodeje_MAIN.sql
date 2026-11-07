-- Do prodeje: 3 koktejly + 3 Ovocné nápoje (rozhodnutí majitele 7. 11. 2026).
--
-- Alergeny (products.allergens; NULL = neověřeno = „Připravujeme“, nejde
-- do košíku — lib/eshop/productRules.ts → isOrderable):
--   lady-carneval, granatovy-bond, kosmopolitan        → '{}' bez alergenů
--   cervankove-nebe, dum-u-jezera, malinovy-svarak-nealko → '{}' bez alergenů
-- Podle složení (vodka, ovocné šťávy, cukr, Aperol, koření); citronová
-- a grepová šťáva jsou 100% šťávy bez přídatných látek (majitel 7. 11.).
-- Lady Carneval: povinné upozornění k barvivům z Aperolu (nařízení
-- 1333/2008, příloha V): „E110, E124: může nepříznivě ovlivňovat činnost a pozornost dětí.“
-- Ovocné nápoje: produkty z begina.cz (= docs/eshop-catalog/71 + 73),
-- hmotnost balení 3 l = 3 kg (stejné pravidlo jako u ostatních 3 l balení,
-- docs/eshop-production/41_hmotnosti.sql).
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když kterákoli pojistka nesedí, NEZMĚNÍ SE NIC.
-- Kontrola po: dotaz na konci souboru (zakomentovaný).
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;

-- 1) Koktejly: alergeny + upozornění k barvivům
DO $$
DECLARE
  changed int;
BEGIN
  UPDATE "products" SET "allergens" = '{}'::text[], "updated_at" = now()
  WHERE "slug" IN ('lady-carneval', 'granatovy-bond', 'kosmopolitan') AND "allergens" IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 3 THEN
    RAISE EXCEPTION 'Čekám 3 koktejly s neověřenými alergeny, našel jsem % (skript už běžel?) — zastavuji, nic se nezměnilo.', changed;
  END IF;
  UPDATE "products" SET "warnings" = array_append("warnings", 'E110, E124: může nepříznivě ovlivňovat činnost a pozornost dětí.'), "updated_at" = now()
  WHERE "slug" = 'lady-carneval' AND NOT ('E110, E124: může nepříznivě ovlivňovat činnost a pozornost dětí.' = ANY("warnings"));
END $$;

-- 2) Ovocné nápoje: produkty, balení a fotky (zatím skryté)
INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "is_active", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'ovocne-napoje'), 'cervankove-nebe', 'Červánkové nebe',
  'Až 12 nápojů (29 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Jablečno-malinový nápoj Červánkové nebe propojuje plnost ovoce s jemným citrusovým akcentem. Chuť je šťavnatá, harmonická a krásně vyvážená – s lehkostí, ke které se rádi vracíte.', '**Prémiový nápoj, který máte v lednici vždy připravený. Stačí podávat vychlazený.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.', '## Moderní alternativa limonád', 'Jablečno-malinový nápoj Červánkové nebe představuje lehkou a moderní alternativu klasických sladkých limonád. Spojuje přirozenou ovocnou plnost s jemnou svěžestí a působí vyváženě a kultivovaně.', 'Je ideální pro každodenní osvěžení i slavnostní příležitosti. Díky různým velikostem balení se hodí jak pro jednotlivce, tak pro rodinné posezení nebo větší setkání s přáteli.', '## Pro koho je vhodný', '- pro ty, kdo mají rádi šťavnatou a přirozeně ovocnou chuť', '- jako lehké osvěžení během dne', '- k posezení s přáteli', '- jako základ pro míchané nápoje']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'vyvážená, přirozená chuť']::text[],
  'Jablečno-malinový nápoj Červánkové nebe má šťavnatý, harmonický charakter. Jablečno-malinová plnost se přirozeně propojuje s jemnou citrusovou linkou a vytváří hladký, vyvážený dojem. Chuť je kulatá, ovocně hluboká a mimořádně pitelná. Je to ten typ nápoje, který si nalijete znovu dřív, než si uvědomíte, že sklenka je prázdná.', 'čistá filtrovaná voda, jablečno-malinová šťáva, citronová šťáva, regulátor kyselosti: kyselina citronová; antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":86,"energy_kcal":20,"fat":0,"saturates":0,"carbohydrate":5.1,"sugars":5,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena.', '{}'::text[], false, 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'cervankove-nebe'), 'cervankove-nebe-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 349, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/cervankove-nebe.jpg', 'Červánkové nebe', 0 FROM "products" WHERE "slug" = 'cervankove-nebe'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'cervankove-nebe' AND pi."url" = '/eshop/cervankove-nebe.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "is_active", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'ovocne-napoje'), 'dum-u-jezera', 'Dům u jezera',
  'Až 12 nápojů (29 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Grepový nápoj Dům u jezera spojuje výraznou citrusovou svěžest s jemnou jablečnou plností. Výsledkem je harmonická chuť, která připomíná letní střik nebo dobře vychlazenou sklenku vína.', '**Prémiový nápoj, který máte v lednici vždy připravený. Stačí podávat vychlazený.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.', '## Moderní alternativa limonád', 'Grepový nápoj Dům u jezera představuje lehkou a moderní alternativu klasických sladkých limonád. Spojuje výraznou grepovou svěžest s jemnou jablečnou plností a působí vyváženě a přirozeně.', 'Je ideální pro každodenní osvěžení i slavnostní příležitosti. Díky různým velikostem balení se hodí jak pro jednotlivce, tak pro rodinné posezení nebo větší setkání s přáteli.', '## Pro koho je vhodný', '- pro ty, kdo mají rádi svěží a výraznější chuť', '- jako lehké osvěžení během dne', '- k posezení s přáteli', '- jako základ pro míchané nápoje']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'vyvážená, přirozená chuť']::text[],
  'Grepový nápoj dům u jezera má výrazný, osvěžující charakter. Grepová svěžest se přirozeně propojuje s jemnou jablečnou plností a vytváří lehký, čistý dojem. Chuť připomíná letní střik nebo dobře vychlazenou sklenku vína a působí svěže a energicky.', 'čistá filtrovaná voda, grepová šťáva, jablečná šťáva, citronová šťáva, regulátor kyselosti: kyselina citronová; antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":52,"energy_kcal":12,"fat":0,"saturates":0,"carbohydrate":2.9,"sugars":2.9,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena.', '{}'::text[], false, 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'dum-u-jezera'), 'dum-u-jezera-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 349, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/dum-u-jezera.jpg', 'Dům u jezera', 0 FROM "products" WHERE "slug" = 'dum-u-jezera'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'dum-u-jezera' AND pi."url" = '/eshop/dum-u-jezera.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "is_active", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'ovocne-napoje'), 'malinovy-svarak-nealko', 'Malinový svařák – nealko',
  'Až 15 nápojů (26,60 Kč za nápoj). Jeden nápoj = 200 ml.', ARRAY['Malinový svařák nealko v sobě spojuje jemnost ovocných tónů s hloubkou tradičního koření. Sladké maliny a jablka se prolínají s nádechem pomeranče, zatímco hřebíček, skořice a badyán dodávají nápoji jeho charakteristickou, harmonickou chuť.', 'Ideální pro klidné večery, zimní atmosféru i chvíle, kdy si chcete dopřát něco výjimečného.', '**Prémiový nápoj, který máte v lednici vždy připravený. Stačí jemně ohřát nebo podávat vychlazený.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechá vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'vyvážená, plná chuť']::text[],
  'Malinový svařák nealko má jemně ovocný, plný a hřejivý charakter. Sladké maliny a jablka se přirozeně doplňují s citrusovým tónem pomeranče, zatímco hřebíček, skořice a badyán dodávají nápoji jeho typickou, příjemně kořeněnou hloubku. Chuť je harmonická, vyvážená a působí příjemným a hřejivým dojmem.', 'čistá filtrovaná voda, jablečná šťáva, malinová šťáva, pomerančová šťáva, hřebíček, skořice, badyán, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":128,"energy_kcal":30,"fat":0,"saturates":0,"carbohydrate":7.3,"sugars":7.1,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena.', '{}'::text[], false, 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'malinovy-svarak-nealko'), 'malinovy-svarak-nealko-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 15, 399, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/malinovy-svarak-nealko.jpg', 'Malinový svařák – nealko', 0 FROM "products" WHERE "slug" = 'malinovy-svarak-nealko'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'malinovy-svarak-nealko' AND pi."url" = '/eshop/malinovy-svarak-nealko.jpg');

-- 3) Ovocné nápoje: hmotnost balení a ověřené alergeny
UPDATE "product_variants" SET "weight_g" = 3000, "updated_at" = now()
WHERE "sku" IN ('cervankove-nebe-3l', 'dum-u-jezera-3l', 'malinovy-svarak-nealko-3l') AND "weight_g" IS NULL;
UPDATE "products" SET "allergens" = '{}'::text[], "updated_at" = now()
WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko');

-- 4) Ovocné nápoje: zveřejnění + text kategorie (pojistky z 73)
DO $$
BEGIN
  IF (SELECT count(*) FROM "products" WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko')) <> 3 THEN
    RAISE EXCEPTION 'STOP: chybí produkty — nejdřív 71_ovocne_napoje.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "products" WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko') AND "allergens" IS NULL) THEN
    RAISE EXCEPTION 'STOP: neověřené alergeny — doplnit ALLERGENS ve skriptu a vygenerovat znovu';
  END IF;
END $$;
UPDATE "product_categories" SET "intro" = ARRAY['Poctivé ovocné prémiové nápoje Begina připravujeme z ovocných šťáv na základě čisté filtrované vody, která nechává vyniknout přirozené chuti každé ingredience. Jako česká značka si zakládáme na tom, aby každá receptura byla vyvážená a přinášela maximum chuti přímo z přírody.', 'Jsou zcela bez přidaného cukru, protože veškerá jejich sladkost pochází výhradně z ovoce. Jedinečný charakter a podmanivou vůni jim dodáváme šetrným zpracováním vybraných přírodních složek. Harmonicky vyniknou ve studené i teplé variantě a zachovávají si svou plnost, svěžest a poctivý charakter.']::text[],
  "detail_sections" = '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Ovocné nápoje Begina jsou praktické řešení pro:","Díky bag-in-box balení lze nápoj jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, "updated_at" = now()
WHERE "slug" = 'ovocne-napoje';
UPDATE "products" SET "is_active" = true, "updated_at" = now() WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko');

COMMIT;

-- Kontrola po (spustit zvlášť; čekáno 6 | 6 | 0 | 1):
-- SELECT count(*) AS v_prodeji,
--        count(*) FILTER (WHERE "allergens" IS NOT NULL) AS overene,
--        (SELECT count(*) FROM "product_variants" v JOIN "products" p2 ON p2."id" = v."product_id"
--          WHERE p2."slug" IN ('cervankove-nebe','dum-u-jezera','malinovy-svarak-nealko') AND v."weight_g" IS NULL) AS bez_hmotnosti,
--        (SELECT count(*) FROM "products" WHERE "slug" = 'lady-carneval' AND 'E110, E124: může nepříznivě ovlivňovat činnost a pozornost dětí.' = ANY("warnings")) AS upozorneni
-- FROM "products" WHERE "is_active" AND "slug" IN ('lady-carneval','granatovy-bond','kosmopolitan','cervankove-nebe','dum-u-jezera','malinovy-svarak-nealko');

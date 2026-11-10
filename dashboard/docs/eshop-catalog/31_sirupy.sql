-- ESHOP 1.0 — katalog: Bylinné sirupy (7 produktů, 14 balení, 21 fotek),
-- text kategorie a společná sekce detailu. VYGENEROVÁNO skriptem
-- scripts/eshop-catalog/build-sirupy.mjs — ručně neupravovat.
-- Texty doslova z begina.cz (produktové stránky dodané vedením 3. 10.
-- 2026): popis, chuť, pro koho, jak používat, složení, výživa na 100 ml,
-- skladování a upozornění. Alergeny a trvanlivost web neuvádí = „Doplníme“.
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou (jedna
-- transakce: chyba = nic se nezmění). Idempotentní — opakované spuštění
-- nic nezdvojí, jen přepíše texty na aktuální. Kontrola před:
-- 30_sirupy_before.sql, po: 32_sirupy_after.sql. Fotky jsou v kódu
-- (public/eshop/<slug>.jpg).
BEGIN;

UPDATE "product_categories" SET "intro" = ARRAY['Bylinné sirupy Begina připravujeme řemeslně z mimořádně silných výluhů a čisté filtrované vody, která nechává vyniknout přirozenou chuť každé ingredience. Jako český výrobce klademe důraz na čistotu složení – naše sirupy jsou bez umělých aromat, barviv a zbytečných konzervantů.', 'Každá receptura je navržena tak, aby chutě harmonicky vynikly v domácích limonádách, horkých nápojích i při dalším použití v kuchyni a zachovaly si svou plnost, svěžest a jedinečný charakter.', 'Pro dokonalý zážitek doporučujeme naše zlaté pravidlo ředění 1:10, se kterým si vytvoříte poctivý domácí drink s duší přírody.']::text[],
  "detail_sections" = '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Sirupy Begina jsou praktické řešení pro:","Stačí zalít horkou nebo studenou perlivou vodou. Díky balení s kohoutkem lze sirup jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, "updated_at" = now()
WHERE "slug" = 'sirupy';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'bylinny-sirup-saman', 'Bylinný sirup Šaman',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,70 Kč.', ARRAY['Bylinný sirup Šaman je výrazný sirup s hlubokým a soustředěným charakterem. Základ tvoří šípek, který doplňují čaga a ženšen, zatímco zázvor dodává chuti jemný kořeněný tón. Výsledkem je vyvážená a kultivovaná chuť s dlouhým dozvukem.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro milovníky výrazných chutí:** pro ty, kteří vyhledávají hluboké a kořenité bylinné nápoje.', '- **Pro milovníky tradic:** pro každého, kdo oceňuje sílu bylin prověřených staletími.', '- **Pro dospělé:** vzhledem k výrazné chuti a silnému bylinnému výluhu doporučujeme Šamana především dospělým.', '- **Pro gastro provoz:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak jej používat', '- **Hřejivý bylinný čaj:** zalijte horkou vodou a vychutnejte jako výrazný hřejivý nápoj.', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **V kuchyni:** zajímavě dochutí čajové směsi nebo domácí nápoje.', '**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['40 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť tohoto bylinného sirupu je hluboká a přirozeně vyvážená. Základ tvoří šípek, který přináší jemně svěží a plný charakter, doplněný zemitými tóny čagy. Výslednou chuť rozvíjí ženšen a zázvor, které dodávají směsi plnost a lehce kořenitý dozvuk.

Vzniká tak kultivovaný bylinný sirup s výrazným charakterem a dlouhým, hřejivým dozvukem na patře.', 'třtinový cukr, bylinný výluh 40 % (čistá filtrovaná voda, šípek (Rosa canina), čaga (Inonotus obliquus), ženšen pravý (Panax ginseng), zázvor (Zingiber officinale)), citronová šťáva 10 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.', ARRAY['Není vhodné pro děti do 3 let, těhotné a kojící ženy.']::text[], 'Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman'), 'bylinny-sirup-saman-3l', '3 l', 'Až 150 nápojů',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete. Dodáváme v kartonové krabici.', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman'), 'bylinny-sirup-saman-750ml', '700 ml', 'Až 35 nápojů',
  '700 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.', 700, 35, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman') AND "url" NOT IN ('/eshop/sirupy/bylinny-sirup-saman-hlavni.jpg', '/eshop/sirupy/bylinny-sirup-saman-sacek.jpg', '/eshop/sirupy/bylinny-sirup-saman-doypack.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman'), '/eshop/sirupy/bylinny-sirup-saman-hlavni.jpg', 'Bylinný sirup Šaman – sklenice a hrnek se surovinami', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman') AND "url" = '/eshop/sirupy/bylinny-sirup-saman-hlavni.jpg');
UPDATE "product_images" SET "alt" = 'Bylinný sirup Šaman – sklenice a hrnek se surovinami', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman') AND "url" = '/eshop/sirupy/bylinny-sirup-saman-hlavni.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman'), '/eshop/sirupy/bylinny-sirup-saman-sacek.jpg', 'Bylinný sirup Šaman v průhledném sáčku s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman') AND "url" = '/eshop/sirupy/bylinny-sirup-saman-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Bylinný sirup Šaman v průhledném sáčku s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman') AND "url" = '/eshop/sirupy/bylinny-sirup-saman-sacek.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman'), '/eshop/sirupy/bylinny-sirup-saman-doypack.jpg', 'Bylinný sirup Šaman ve stříbrném doypacku', 2
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman') AND "url" = '/eshop/sirupy/bylinny-sirup-saman-doypack.jpg');
UPDATE "product_images" SET "alt" = 'Bylinný sirup Šaman ve stříbrném doypacku', "sort_order" = 2 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman') AND "url" = '/eshop/sirupy/bylinny-sirup-saman-doypack.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'zazvorovy-sirup', 'Zázvorový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,30 Kč.', ARRAY['Zázvorový sirup je poctivý sirup s intenzivním řízem a hřejivým charakterem. Tento tradiční sirup v sobě nese sílu přírody a výraznou chuť zázvoru. Vyniká přirozeně kořenitou chutí a svěžím dozvukem.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro milovníky výrazných chutí:** ideální pro ty, kteří mají rádi přirozeně kořenité nápoje.', '- **Pro domácí přípravu nápojů:** skvělý základ pro poctivé domácí limonády i hřejivé nápoje.', '- **Pro gastro provozy:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak sirup používat', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **Hřejivý nápoj:** přidejte do horké vody pro příjemně kořenitý nápoj.', '- **V kuchyni:** skvěle dochutí čaje, dezerty nebo jogurt s ovocem.', '**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['39 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je intenzivní, přímá a autenticky pálivá, přesně tak, jak to od poctivého zázvoru čekáte. Má plné a výrazné tělo, které v nápoji zůstává krásně čitelné až do posledního doušku. Působí svěže, s jemně zemitým závěrem, který příjemně zahřeje v horkém nápoji a osvěží v ledové limonádě.', 'třtinový cukr, bylinný výluh 39 % (čistá filtrovaná voda, zázvor (Zingiber officinale)), citronová šťáva 12 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.', '{}'::text[], 'Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup'), 'zazvorovy-sirup-3l', '3 l', 'Až 150 nápojů',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete. Dodáváme v kartonové krabici.', 3000, 150, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup'), 'zazvorovy-sirup-750ml', '700 ml', 'Až 35 nápojů',
  '700 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.', 700, 35, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup') AND "url" NOT IN ('/eshop/sirupy/zazvorovy-sirup-hlavni.jpg', '/eshop/sirupy/zazvorovy-sirup-sacek.jpg', '/eshop/sirupy/zazvorovy-sirup-doypack.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup'), '/eshop/sirupy/zazvorovy-sirup-hlavni.jpg', 'Zázvorový sirup – sklenice a hrnek se surovinami', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup') AND "url" = '/eshop/sirupy/zazvorovy-sirup-hlavni.jpg');
UPDATE "product_images" SET "alt" = 'Zázvorový sirup – sklenice a hrnek se surovinami', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup') AND "url" = '/eshop/sirupy/zazvorovy-sirup-hlavni.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup'), '/eshop/sirupy/zazvorovy-sirup-sacek.jpg', 'Zázvorový sirup v průhledném sáčku s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup') AND "url" = '/eshop/sirupy/zazvorovy-sirup-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Zázvorový sirup v průhledném sáčku s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup') AND "url" = '/eshop/sirupy/zazvorovy-sirup-sacek.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup'), '/eshop/sirupy/zazvorovy-sirup-doypack.jpg', 'Zázvorový sirup ve stříbrném doypacku', 2
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup') AND "url" = '/eshop/sirupy/zazvorovy-sirup-doypack.jpg');
UPDATE "product_images" SET "alt" = 'Zázvorový sirup ve stříbrném doypacku', "sort_order" = 2 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup') AND "url" = '/eshop/sirupy/zazvorovy-sirup-doypack.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'lipovy-sirup', 'Lipový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,70 Kč.', ARRAY['Lipový sirup nabízí jemnou, medovou a uklidňující chuť v každé kapce. Tato zlatavá radost v sobě nese klid letního podvečera a poctivost tradičního bylinkářství.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro děti i dospělé:** díky své jemnosti a přirozeně nasládlému profilu chutná celé rodině.', '- **Pro chvíle relaxace:** ideální součást Vašeho rituálu pro zpomalení a pohodu po náročném dni.', '- **Pro tvořivé barmany:** skvělý základ pro originální domácí limonády.', '## Jak sirup používat', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a snítkou máty.', '- **Hřejivý nápoj:** přidejte do horké vody pro chvíle pohody a zahřátí.', '**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['39 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je hluboká, medově jemná a přirozeně harmonická. Lípa je tradiční bylinka s konejšivým charakterem, která v nápojích působí velmi lehce a zanechá hebký pocit na patře.', 'třtinový cukr, bylinný výluh 39 % (čistá filtrovaná voda, lipový květ (Tiliae flos)), citronová šťáva 12 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.', '{}'::text[], 'Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup'), 'lipovy-sirup-3l', '3 l', 'Až 150 nápojů',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete. Dodáváme v kartonové krabici.', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup'), 'lipovy-sirup-750ml', '700 ml', 'Až 35 nápojů',
  '700 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.', 700, 35, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup') AND "url" NOT IN ('/eshop/sirupy/lipovy-sirup-hlavni.jpg', '/eshop/sirupy/lipovy-sirup-sacek.jpg', '/eshop/sirupy/lipovy-sirup-doypack.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup'), '/eshop/sirupy/lipovy-sirup-hlavni.jpg', 'Lipový sirup – sklenice a hrnek se surovinami', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup') AND "url" = '/eshop/sirupy/lipovy-sirup-hlavni.jpg');
UPDATE "product_images" SET "alt" = 'Lipový sirup – sklenice a hrnek se surovinami', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup') AND "url" = '/eshop/sirupy/lipovy-sirup-hlavni.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup'), '/eshop/sirupy/lipovy-sirup-sacek.jpg', 'Lipový sirup v průhledném sáčku s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup') AND "url" = '/eshop/sirupy/lipovy-sirup-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Lipový sirup v průhledném sáčku s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup') AND "url" = '/eshop/sirupy/lipovy-sirup-sacek.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup'), '/eshop/sirupy/lipovy-sirup-doypack.jpg', 'Lipový sirup ve stříbrném doypacku', 2
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup') AND "url" = '/eshop/sirupy/lipovy-sirup-doypack.jpg');
UPDATE "product_images" SET "alt" = 'Lipový sirup ve stříbrném doypacku', "sort_order" = 2 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup') AND "url" = '/eshop/sirupy/lipovy-sirup-doypack.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'ibiskovy-sirup', 'Ibiškový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,30 Kč.', ARRAY['Ibiškový sirup je poctivý bylinný sirup se svěžím, energickým a jasně definovaným charakterem. Tento rubínový poklad v sobě nese sílu slunce a čistou radost z přírody, která se odráží v jeho typické syté barvě. Výrazná chuť květů ibišku je ideální pro domácí limonádu, osvěžující letní nápoje i hřejivý ibiškový čaj. Vyniká přirozenou plností a osvěžujícím dozvukem.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (41 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho vhodný', '- **Pro celou rodinu:** díky své svěžesti a výrazné barvě chutná dětem i dospělým.', '- **Pro milovníky přírody:** ideální pro ty, kteří hledají poctivý ibiškový sirup z kvalitních surovin.', '- **Pro kreativce:** skvělý základ pro domácí limonády nebo hřejivé zimní nápoje.', '## Jak jej používat', '- **Ranní start:** začněte den sklenicí vlažné vody s ibiškovým sirupem. Příjemná chuť vás probudí a dodá energii do nového dne.', '- **Osvěžující limonáda:** v letních dnech doplňte perlivou vodou, ledem a plátkem citronu. Získáte drink s nádhernou barvou, který vypadá skvěle i v karafě.', '**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['41 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je výrazná, přirozeně svěží a hluboce harmonická. Ibišek dodává sirupu sytost a charakteristickou barvu, kterou doplňuje svěží tón citronové šťávy. Je to tradiční receptura s čistým a jasným projevem, který zanechá osvěžující pocit na patře.', 'třtinový cukr, bylinný výluh 41 % (čistá filtrovaná voda, květ ibišku (Hibiscus sabdariffa)), citronová šťáva 8 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.', '{}'::text[], 'Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 40)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup'), 'ibiskovy-sirup-3l', '3 l', 'Až 150 nápojů',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete. Dodáváme v kartonové krabici.', 3000, 150, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup'), 'ibiskovy-sirup-750ml', '700 ml', 'Až 35 nápojů',
  '700 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.', 700, 35, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup') AND "url" NOT IN ('/eshop/sirupy/ibiskovy-sirup-hlavni.jpg', '/eshop/sirupy/ibiskovy-sirup-sacek.jpg', '/eshop/sirupy/ibiskovy-sirup-doypack.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup'), '/eshop/sirupy/ibiskovy-sirup-hlavni.jpg', 'Ibiškový sirup – sklenice a hrnek se surovinami', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup') AND "url" = '/eshop/sirupy/ibiskovy-sirup-hlavni.jpg');
UPDATE "product_images" SET "alt" = 'Ibiškový sirup – sklenice a hrnek se surovinami', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup') AND "url" = '/eshop/sirupy/ibiskovy-sirup-hlavni.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup'), '/eshop/sirupy/ibiskovy-sirup-sacek.jpg', 'Ibiškový sirup v průhledném sáčku s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup') AND "url" = '/eshop/sirupy/ibiskovy-sirup-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Ibiškový sirup v průhledném sáčku s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup') AND "url" = '/eshop/sirupy/ibiskovy-sirup-sacek.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup'), '/eshop/sirupy/ibiskovy-sirup-doypack.jpg', 'Ibiškový sirup ve stříbrném doypacku', 2
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup') AND "url" = '/eshop/sirupy/ibiskovy-sirup-doypack.jpg');
UPDATE "product_images" SET "alt" = 'Ibiškový sirup ve stříbrném doypacku', "sort_order" = 2 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup') AND "url" = '/eshop/sirupy/ibiskovy-sirup-doypack.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'sipkovy-sirup', 'Šípkový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,30 Kč.', ARRAY['Šípkový sirup nabízí plnou a vyzrálou chuť šípkové růže s harmonickou hloubkou. Výrazný charakter šípku je ideální pro osvěžující domácí limonádu i hřejivý šípkový čaj. Vyniká přirozenou plností a dlouhým dozvukem.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro rodiny:** přírodní alternativa k běžným limonádám, kterou si oblíbí dospělí i děti.', '- **Pro milovníky klidných chvil:** ideální součást večerního rituálu pro chvíle odpočinku a pohody.', '- **Pro gastro provoz:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak sirup používat', '- **Osvěžující limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **Hřejivý nápoj:** přidejte do horké vody pro chvíle pohody.', '- **V kuchyni:** skvěle osladí ranní kaši nebo jogurt s ovocem.', '**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['40 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je plná, kulatá a přirozeně vyvážená. Šípek vytváří vyzrálý chuťový profil s jemně hlubším dozvukem. V nápojích působí harmonicky a čistě, přesně tak, jak to od řemeslné výroby Begina očekáváte.', 'třtinový cukr, bylinný výluh 40 % (čistá filtrovaná voda, šípek (Rosa canina)), citronová šťáva 9 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.', '{}'::text[], 'Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 50)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup'), 'sipkovy-sirup-3l', '3 l', 'Až 150 nápojů',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete. Dodáváme v kartonové krabici.', 3000, 150, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup'), 'sipkovy-sirup-750ml', '700 ml', 'Až 35 nápojů',
  '700 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.', 700, 35, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup') AND "url" NOT IN ('/eshop/sirupy/sipkovy-sirup-hlavni.jpg', '/eshop/sirupy/sipkovy-sirup-sacek.jpg', '/eshop/sirupy/sipkovy-sirup-doypack.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup'), '/eshop/sirupy/sipkovy-sirup-hlavni.jpg', 'Šípkový sirup – sklenice a hrnek se surovinami', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup') AND "url" = '/eshop/sirupy/sipkovy-sirup-hlavni.jpg');
UPDATE "product_images" SET "alt" = 'Šípkový sirup – sklenice a hrnek se surovinami', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup') AND "url" = '/eshop/sirupy/sipkovy-sirup-hlavni.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup'), '/eshop/sirupy/sipkovy-sirup-sacek.jpg', 'Šípkový sirup v průhledném sáčku s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup') AND "url" = '/eshop/sirupy/sipkovy-sirup-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Šípkový sirup v průhledném sáčku s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup') AND "url" = '/eshop/sirupy/sipkovy-sirup-sacek.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup'), '/eshop/sirupy/sipkovy-sirup-doypack.jpg', 'Šípkový sirup ve stříbrném doypacku', 2
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup') AND "url" = '/eshop/sirupy/sipkovy-sirup-doypack.jpg');
UPDATE "product_images" SET "alt" = 'Šípkový sirup ve stříbrném doypacku', "sort_order" = 2 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup') AND "url" = '/eshop/sirupy/sipkovy-sirup-doypack.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'hermankovy-sirup', 'Heřmánkový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,70 Kč.', ARRAY['Heřmánkový sirup nabízí jemnou, čistou a bylinnou chuť s přirozeně konejšivým charakterem v každé kapce. Tento slunečný dar v sobě nese sílu přírody a poctivost tradičního bylinkářství. Vyniká svou typickou vůní a jemností, která přináší pocit pohody a harmonie.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (36 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro rodiny:** přírodní alternativa k běžným limonádám, kterou si oblíbí dospělí i děti.', '- **Pro milovníky klidných chvil:** ideální součást večerního rituálu pro chvíle odpočinku.', '- **Pro gastro provoz:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak ho používat', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **Hřejivý nápoj:** přidejte do horké vody pro chvíle pohody.', '- **V kuchyni:** skvěle osladí ranní kaši nebo jogurt s ovocem.', '**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['36 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je čistá, lehká a přirozeně květová. Heřmánek vytváří jemný profil, který v nápojích nepřebíjí, ale krásně doplňuje ostatní chutě. V ústech zanechá příjemně hebký a konejšivý dozvuk.', 'třtinový cukr, bylinný výluh 36 % (čistá filtrovaná voda, květ heřmánku (Matricaria chamomilla)), citronová šťáva 16 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.', '{}'::text[], 'Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 60)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup'), 'hermankovy-sirup-3l', '3 l', 'Až 150 nápojů',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete. Dodáváme v kartonové krabici.', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup'), 'hermankovy-sirup-750ml', '700 ml', 'Až 35 nápojů',
  '700 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.', 700, 35, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup') AND "url" NOT IN ('/eshop/sirupy/hermankovy-sirup-hlavni.jpg', '/eshop/sirupy/hermankovy-sirup-sacek.jpg', '/eshop/sirupy/hermankovy-sirup-doypack.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup'), '/eshop/sirupy/hermankovy-sirup-hlavni.jpg', 'Heřmánkový sirup – sklenice a hrnek se surovinami', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup') AND "url" = '/eshop/sirupy/hermankovy-sirup-hlavni.jpg');
UPDATE "product_images" SET "alt" = 'Heřmánkový sirup – sklenice a hrnek se surovinami', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup') AND "url" = '/eshop/sirupy/hermankovy-sirup-hlavni.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup'), '/eshop/sirupy/hermankovy-sirup-sacek.jpg', 'Heřmánkový sirup v průhledném sáčku s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup') AND "url" = '/eshop/sirupy/hermankovy-sirup-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Heřmánkový sirup v průhledném sáčku s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup') AND "url" = '/eshop/sirupy/hermankovy-sirup-sacek.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup'), '/eshop/sirupy/hermankovy-sirup-doypack.jpg', 'Heřmánkový sirup ve stříbrném doypacku', 2
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup') AND "url" = '/eshop/sirupy/hermankovy-sirup-doypack.jpg');
UPDATE "product_images" SET "alt" = 'Heřmánkový sirup ve stříbrném doypacku', "sort_order" = 2 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup') AND "url" = '/eshop/sirupy/hermankovy-sirup-doypack.jpg';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'medunkovy-sirup-s-levanduli', 'Meduňkový sirup s levandulí',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,70 Kč.', ARRAY['Meduňkový sirup s levandulí nabízí jemnou bylinnou a květinovou chuť. Spojení meduňky a levandule vytváří lehký aromatický profil s příjemnou květinovou vůní a přirozenou jemností, která působí jemně a harmonicky.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (36 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro rodiny:** přírodní alternativa k běžným limonádám, kterou si oblíbí dospělí i děti.', '- **Pro milovníky klidných chvil:** ideální součást večerního rituálu pro chvíle odpočinku.', '- **Pro gastro provoz:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak sirup používat', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **Hřejivý nápoj:** přidejte do horké vody pro chvíle pohody.', '- **V kuchyni:** skvěle osladí ranní kaši nebo jogurt s ovocem.', '**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['36 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je čistá, lehká a přirozeně květinová. Meduňka s levandulí vytvářejí jemný bylinný profil, který nápoji dodává harmonii a příjemnou hloubku. V ústech zanechává hebký a dlouhý dozvuk s jemně květinovým charakterem.', 'třtinový cukr, bylinný výluh 36 % (čistá filtrovaná voda, meduňka (Melissa officinalis), květ levandule (Lavandula angustifolia)), citronová šťáva 16 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.', '{}'::text[], 'Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', 70)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'), 'medunkovy-sirup-s-levanduli-3l', '3 l', 'Až 150 nápojů',
  '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete. Dodáváme v kartonové krabici.', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'), 'medunkovy-sirup-s-levanduli-750ml', '700 ml', 'Až 35 nápojů',
  '700 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.', 700, 35, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

DELETE FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli') AND "url" NOT IN ('/eshop/sirupy/medunkovy-sirup-s-levanduli-hlavni.jpg', '/eshop/sirupy/medunkovy-sirup-s-levanduli-sacek.jpg', '/eshop/sirupy/medunkovy-sirup-s-levanduli-doypack.jpg');
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'), '/eshop/sirupy/medunkovy-sirup-s-levanduli-hlavni.jpg', 'Meduňkový sirup s levandulí – sklenice a hrnek se surovinami', 0
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli') AND "url" = '/eshop/sirupy/medunkovy-sirup-s-levanduli-hlavni.jpg');
UPDATE "product_images" SET "alt" = 'Meduňkový sirup s levandulí – sklenice a hrnek se surovinami', "sort_order" = 0 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli') AND "url" = '/eshop/sirupy/medunkovy-sirup-s-levanduli-hlavni.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'), '/eshop/sirupy/medunkovy-sirup-s-levanduli-sacek.jpg', 'Meduňkový sirup s levandulí v průhledném sáčku s kohoutkem', 1
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli') AND "url" = '/eshop/sirupy/medunkovy-sirup-s-levanduli-sacek.jpg');
UPDATE "product_images" SET "alt" = 'Meduňkový sirup s levandulí v průhledném sáčku s kohoutkem', "sort_order" = 1 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli') AND "url" = '/eshop/sirupy/medunkovy-sirup-s-levanduli-sacek.jpg';
INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'), '/eshop/sirupy/medunkovy-sirup-s-levanduli-doypack.jpg', 'Meduňkový sirup s levandulí ve stříbrném doypacku', 2
WHERE NOT EXISTS (SELECT 1 FROM "product_images" WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli') AND "url" = '/eshop/sirupy/medunkovy-sirup-s-levanduli-doypack.jpg');
UPDATE "product_images" SET "alt" = 'Meduňkový sirup s levandulí ve stříbrném doypacku', "sort_order" = 2 WHERE "product_id" = (SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli') AND "url" = '/eshop/sirupy/medunkovy-sirup-s-levanduli-doypack.jpg';

COMMIT;

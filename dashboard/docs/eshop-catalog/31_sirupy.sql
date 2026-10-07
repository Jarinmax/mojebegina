-- ESHOP 1.0 — katalog: Bylinné sirupy (7 produktů, 14 balení, 7 fotek),
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
  "detail_sections" = '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Sirupy Begina jsou praktické řešení pro:","Stačí zalít horkou nebo studenou perlivou vodou. Díky bag-in-box balení lze sirup jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, "updated_at" = now()
WHERE "slug" = 'sirupy';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'bylinny-sirup-saman', 'Bylinný sirup Šaman',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,70 Kč.', ARRAY['Bylinný sirup Šaman je výrazný sirup s hlubokým a soustředěným charakterem. Základ tvoří šípek, který doplňují čaga a ženšen, zatímco zázvor dodává chuti jemný kořeněný tón. Výsledkem je vyvážená a kultivovaná chuť s dlouhým dozvukem.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro milovníky výrazných chutí:** pro ty, kteří vyhledávají hluboké a kořenité bylinné nápoje.', '- **Pro milovníky tradic:** pro každého, kdo oceňuje sílu bylin prověřených staletími.', '- **Pro dospělé:** vzhledem k výrazné chuti a silnému bylinnému výluhu doporučujeme Šamana především dospělým.', '- **Pro gastro provoz:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak jej používat', '- **Hřejivý bylinný čaj:** zalijte horkou vodou a vychutnejte jako výrazný hřejivý nápoj.', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **V kuchyni:** zajímavě dochutí čajové směsi nebo domácí nápoje.', '**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['40 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť tohoto bylinného sirupu je hluboká a přirozeně vyvážená. Základ tvoří šípek, který přináší jemně svěží a plný charakter, doplněný zemitými tóny čagy. Výslednou chuť rozvíjí ženšen a zázvor, které dodávají směsi plnost a lehce kořenitý dozvuk.

Vzniká tak kultivovaný bylinný sirup s výrazným charakterem a dlouhým, hřejivým dozvukem na patře.', 'třtinový cukr, bylinný výluh 40 % (čistá filtrovaná voda, šípek (Rosa canina), čaga (Inonotus obliquus), ženšen pravý (Panax ginseng), zázvor (Zingiber officinale)), citronová šťáva 10 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v dobře uzavřeném obalu v chladu a temnu a spotřebujte do 3 měsíců. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.', ARRAY['Není vhodné pro děti do 3 let, těhotné a kojící ženy.']::text[], 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman'), 'bylinny-sirup-saman-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman'), 'bylinny-sirup-saman-750ml', '750 g Praktické balení', 'Až 37 nápojů',
  'Lehké a nerozbitné balení vhodné na cesty, do práce nebo pro menší spotřebu.', null, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/bylinny-sirup-saman.jpg', 'Bylinný sirup Šaman', 0 FROM "products" WHERE "slug" = 'bylinny-sirup-saman'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'bylinny-sirup-saman' AND pi."url" = '/eshop/bylinny-sirup-saman.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'zazvorovy-sirup', 'Zázvorový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,30 Kč.', ARRAY['Zázvorový sirup je poctivý sirup s intenzivním řízem a hřejivým charakterem. Tento tradiční sirup v sobě nese sílu přírody a výraznou chuť zázvoru. Vyniká přirozeně kořenitou chutí a svěžím dozvukem.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro milovníky výrazných chutí:** ideální pro ty, kteří mají rádi přirozeně kořenité nápoje.', '- **Pro domácí přípravu nápojů:** skvělý základ pro poctivé domácí limonády i hřejivé nápoje.', '- **Pro gastro provozy:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak sirup používat', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **Hřejivý nápoj:** přidejte do horké vody pro příjemně kořenitý nápoj.', '- **V kuchyni:** skvěle dochutí čaje, dezerty nebo jogurt s ovocem.', '**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['39 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je intenzivní, přímá a autenticky pálivá, přesně tak, jak to od poctivého zázvoru čekáte. Má plné a výrazné tělo, které v nápoji zůstává krásně čitelné až do posledního doušku. Působí svěže, s jemně zemitým závěrem, který příjemně zahřeje v horkém nápoji a osvěží v ledové limonádě.', 'třtinový cukr, bylinný výluh 39 % (čistá filtrovaná voda, zázvor (Zingiber officinale)), citronová šťáva 12 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v chladu a dobře uzavřeném obalu a spotřebujte do 3 měsíců od otevření. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.', '{}'::text[], 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup'), 'zazvorovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 150, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup'), 'zazvorovy-sirup-750ml', '750 g Praktické balení', 'Až 37 nápojů',
  'Lehké a nerozbitné balení vhodné na cesty, do práce nebo pro menší spotřebu.', null, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/zazvorovy-sirup.jpg', 'Zázvorový sirup', 0 FROM "products" WHERE "slug" = 'zazvorovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'zazvorovy-sirup' AND pi."url" = '/eshop/zazvorovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'lipovy-sirup', 'Lipový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,70 Kč.', ARRAY['Lipový sirup nabízí jemnou, medovou a uklidňující chuť v každé kapce. Tato zlatavá radost v sobě nese klid letního podvečera a poctivost tradičního bylinkářství.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro děti i dospělé:** díky své jemnosti a přirozeně nasládlému profilu chutná celé rodině.', '- **Pro chvíle relaxace:** ideální součást Vašeho rituálu pro zpomalení a pohodu po náročném dni.', '- **Pro tvořivé barmany:** skvělý základ pro originální domácí limonády.', '## Jak sirup používat', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a snítkou máty.', '- **Hřejivý nápoj:** přidejte do horké vody pro chvíle pohody a zahřátí.', '**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['39 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je hluboká, medově jemná a přirozeně harmonická. Lípa je tradiční bylinka s konejšivým charakterem, která v nápojích působí velmi lehce a zanechá hebký pocit na patře.', 'třtinový cukr, bylinný výluh 39 % (čistá filtrovaná voda, lipový květ (Tiliae flos)), citronová šťáva 12 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v dobře uzavřeném obalu v chladu a temnu a spotřebujte do 3 měsíců. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.', '{}'::text[], 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup'), 'lipovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup'), 'lipovy-sirup-750ml', '750 g Praktické balení', 'Až 37 nápojů',
  'Lehké a nerozbitné balení vhodné na cesty, do práce nebo pro menší spotřebu.', null, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/lipovy-sirup.jpg', 'Lipový sirup', 0 FROM "products" WHERE "slug" = 'lipovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'lipovy-sirup' AND pi."url" = '/eshop/lipovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'ibiskovy-sirup', 'Ibiškový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,30 Kč.', ARRAY['Ibiškový sirup je poctivý bylinný sirup se svěžím, energickým a jasně definovaným charakterem. Tento rubínový poklad v sobě nese sílu slunce a čistou radost z přírody, která se odráží v jeho typické syté barvě. Výrazná chuť květů ibišku je ideální pro domácí limonádu, osvěžující letní nápoje i hřejivý ibiškový čaj. Vyniká přirozenou plností a osvěžujícím dozvukem.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (41 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho vhodný', '- **Pro celou rodinu:** díky své svěžesti a výrazné barvě chutná dětem i dospělým.', '- **Pro milovníky přírody:** ideální pro ty, kteří hledají poctivý ibiškový sirup z kvalitních surovin.', '- **Pro kreativce:** skvělý základ pro domácí limonády nebo hřejivé zimní nápoje.', '## Jak jej používat', '- **Ranní start:** začněte den sklenicí vlažné vody s ibiškovým sirupem. Příjemná chuť vás probudí a dodá energii do nového dne.', '- **Osvěžující limonáda:** v letních dnech doplňte perlivou vodou, ledem a plátkem citronu. Získáte drink s nádhernou barvou, který vypadá skvěle i v karafě.', '**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['41 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je výrazná, přirozeně svěží a hluboce harmonická. Ibišek dodává sirupu sytost a charakteristickou barvu, kterou doplňuje svěží tón citronové šťávy. Je to tradiční receptura s čistým a jasným projevem, který zanechá osvěžující pocit na patře.', 'třtinový cukr, bylinný výluh 41 % (čistá filtrovaná voda, květ ibišku (Hibiscus sabdariffa)), citronová šťáva 8 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v chladu a dobře uzavřeném obalu a spotřebujte do 3 měsíců od otevření. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.', '{}'::text[], 40)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup'), 'ibiskovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 150, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup'), 'ibiskovy-sirup-750ml', '750 g Praktické balení', 'Až 37 nápojů',
  'Lehké a nerozbitné balení vhodné na cesty, do práce nebo pro menší spotřebu.', null, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/ibiskovy-sirup.jpg', 'Ibiškový sirup', 0 FROM "products" WHERE "slug" = 'ibiskovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'ibiskovy-sirup' AND pi."url" = '/eshop/ibiskovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'sipkovy-sirup', 'Šípkový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,30 Kč.', ARRAY['Šípkový sirup nabízí plnou a vyzrálou chuť šípkové růže s harmonickou hloubkou. Výrazný charakter šípku je ideální pro osvěžující domácí limonádu i hřejivý šípkový čaj. Vyniká přirozenou plností a dlouhým dozvukem.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro rodiny:** přírodní alternativa k běžným limonádám, kterou si oblíbí dospělí i děti.', '- **Pro milovníky klidných chvil:** ideální součást večerního rituálu pro chvíle odpočinku a pohody.', '- **Pro gastro provoz:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak sirup používat', '- **Osvěžující limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **Hřejivý nápoj:** přidejte do horké vody pro chvíle pohody.', '- **V kuchyni:** skvěle osladí ranní kaši nebo jogurt s ovocem.', '**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['40 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je plná, kulatá a přirozeně vyvážená. Šípek vytváří vyzrálý chuťový profil s jemně hlubším dozvukem. V nápojích působí harmonicky a čistě, přesně tak, jak to od řemeslné výroby Begina očekáváte.', 'třtinový cukr, bylinný výluh 40 % (čistá filtrovaná voda, šípek (Rosa canina)), citronová šťáva 9 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v chladu a dobře uzavřeném obalu a spotřebujte do 3 měsíců od otevření. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.', '{}'::text[], 50)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup'), 'sipkovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 150, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup'), 'sipkovy-sirup-750ml', '750 g Praktické balení', 'Až 37 nápojů',
  'Lehké a nerozbitné balení vhodné na cesty, do práce nebo pro menší spotřebu.', null, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/sipkovy-sirup.jpg', 'Šípkový sirup', 0 FROM "products" WHERE "slug" = 'sipkovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'sipkovy-sirup' AND pi."url" = '/eshop/sipkovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'hermankovy-sirup', 'Heřmánkový sirup',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,70 Kč.', ARRAY['Heřmánkový sirup nabízí jemnou, čistou a bylinnou chuť s přirozeně konejšivým charakterem v každé kapce. Tento slunečný dar v sobě nese sílu přírody a poctivost tradičního bylinkářství. Vyniká svou typickou vůní a jemností, která přináší pocit pohody a harmonie.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (36 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro rodiny:** přírodní alternativa k běžným limonádám, kterou si oblíbí dospělí i děti.', '- **Pro milovníky klidných chvil:** ideální součást večerního rituálu pro chvíle odpočinku.', '- **Pro gastro provoz:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak ho používat', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **Hřejivý nápoj:** přidejte do horké vody pro chvíle pohody.', '- **V kuchyni:** skvěle osladí ranní kaši nebo jogurt s ovocem.', '**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['36 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je čistá, lehká a přirozeně květová. Heřmánek vytváří jemný profil, který v nápojích nepřebíjí, ale krásně doplňuje ostatní chutě. V ústech zanechá příjemně hebký a konejšivý dozvuk.', 'třtinový cukr, bylinný výluh 36 % (čistá filtrovaná voda, květ heřmánku (Matricaria chamomilla)), citronová šťáva 16 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v chladu a dobře uzavřeném obalu a spotřebujte do 3 měsíců od otevření. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.', '{}'::text[], 60)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup'), 'hermankovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup'), 'hermankovy-sirup-750ml', '750 g Praktické balení', 'Až 37 nápojů',
  'Lehké a nerozbitné balení vhodné na cesty, do práce nebo pro menší spotřebu.', null, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/hermankovy-sirup.jpg', 'Heřmánkový sirup', 0 FROM "products" WHERE "slug" = 'hermankovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'hermankovy-sirup' AND pi."url" = '/eshop/hermankovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'medunkovy-sirup-s-levanduli', 'Meduňkový sirup s levandulí',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,70 Kč.', ARRAY['Meduňkový sirup s levandulí nabízí jemnou bylinnou a květinovou chuť. Spojení meduňky a levandule vytváří lehký aromatický profil s příjemnou květinovou vůní a přirozenou jemností, která působí jemně a harmonicky.', '**Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.**', 'Připravujeme jej z mimořádně silného bylinného výluhu (36 %), kvalitního třtinového cukru a čisté filtrované vody.', '## Pro koho je vhodný', '- **Pro rodiny:** přírodní alternativa k běžným limonádám, kterou si oblíbí dospělí i děti.', '- **Pro milovníky klidných chvil:** ideální součást večerního rituálu pro chvíle odpočinku.', '- **Pro gastro provoz:** kvalitní a ekonomický základ pro prémiové domácí nápoje.', '## Jak sirup používat', '- **Osvěžující domácí limonáda:** smíchejte s perlivou vodou, ledem a plátkem citronu.', '- **Hřejivý nápoj:** přidejte do horké vody pro chvíle pohody.', '- **V kuchyni:** skvěle osladí ranní kaši nebo jogurt s ovocem.', '**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**', 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.']::text[], ARRAY['36 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[],
  'Chuť je čistá, lehká a přirozeně květinová. Meduňka s levandulí vytvářejí jemný bylinný profil, který nápoji dodává harmonii a příjemnou hloubku. V ústech zanechává hebký a dlouhý dozvuk s jemně květinovým charakterem.', 'třtinový cukr, bylinný výluh 36 % (čistá filtrovaná voda, meduňka (Melissa officinalis), květ levandule (Lavandula angustifolia)), citronová šťáva 16 %, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v suchu a temnu při teplotě do 25 °C. Po otevření uchovávejte v chladu a dobře uzavřeném obalu a spotřebujte do 3 měsíců od otevření. Před použitím protřepejte. Případný sediment je přirozenou součástí bylinného výluhu.', '{}'::text[], 70)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'), 'medunkovy-sirup-s-levanduli-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'), 'medunkovy-sirup-s-levanduli-750ml', '750 g Praktické balení', 'Až 37 nápojů',
  'Lehké a nerozbitné balení vhodné na cesty, do práce nebo pro menší spotřebu.', null, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/medunkovy-sirup-s-levanduli.jpg', 'Meduňkový sirup s levandulí', 0 FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'medunkovy-sirup-s-levanduli' AND pi."url" = '/eshop/medunkovy-sirup-s-levanduli.jpg');

COMMIT;

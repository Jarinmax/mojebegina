-- PRODUCTION main — fáze A, zbytek: katalog Sirupy + Polévky + Čaje a platby krok A S POJISTKOU
-- (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs z docs/eshop-catalog/31_sirupy.sql, docs/eshop-catalog/41_polevky.sql, docs/eshop-catalog/51_caje.sql, docs/eshop-payments/11_migration.sql).
-- Obsah skriptů beze změny, jen v JEDNÉ transakci. Jako první krok kontrola: větev main
-- (neon.timeline_id 70a96b3677653646e65343cae8e27182) + stav po migracích 0013–0019. Jinak „STOP“ a NIC se nezmění.
-- Spouštět CELÉ najednou v Neon SQL Editoru. Kontroly po: 32_sirupy_after (sloupce produkty | baleni_celkem
-- budou 25 | 36, protože se počítají až po polévkách a čajích), 42_polevky_after, 52_caje_after, eshop-payments/12_after.

BEGIN;

-- ===== POJISTKA: jen Production main, jen jednou =====
DO $guard$
DECLARE
  timeline text := current_setting('neon.timeline_id', true);
BEGIN
  IF timeline IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'STOP: tohle NENÍ Production větev main (neon.timeline_id = %). Nic se nezměnilo.', coalesce(timeline, 'neznámý');
  END IF;
  IF (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') < 24
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    RAISE EXCEPTION 'STOP: chybí migrace 0013–0019 (nejdřív 11_migrations_0013_0019_MAIN.sql). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments')
     OR (SELECT count(*) FROM products) <> 7 THEN
    RAISE EXCEPTION 'STOP: katalog nebo platby už běžely (nebo neočekávaný stav). Nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'OK: Production main po migracích 0013–0019 — pokračuji katalogem a platbami (krok A).';
END
$guard$;

-- ===== docs/eshop-catalog/31_sirupy.sql =====
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

-- ===== docs/eshop-catalog/41_polevky.sql =====
-- ESHOP 1.0 — katalog: Čerstvé polévky (Dýňová polévka, Kulajda, Rajčatová polévka, Rajčatová polévka s červenou řepou, Gulášová polévka z hlívy ústřičné, Špenátová polévka)
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
-- (public/eshop/<slug>.jpg). Vrácení: 49_polevky_rollback.sql.

UPDATE "product_categories" SET "detail_sections" = '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Polévky Begina jsou praktické řešení pro:","Stačí ohřát a podávat. Díky bag-in-box balení lze polévku jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, "updated_at" = now()
WHERE "slug" = 'polevky';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'dynova-polevka', 'Dýňová polévka',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Dýňová polévka s kokosovým mlékem stojí na plném a výrazném základu kvalitní dýně. Krémová struktura, jemnost kokosového mléka a pečlivě zvolené koření vytvářejí harmonickou chuť s přirozeně bohatým charakterem.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky krémových zeleninových polévek', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Základ tvoří kvalitní dýně, kterou doplňují brambory a pečlivě zvolené koření. Kokosové mléko zjemňuje strukturu a dodává krémovost. Chuť je vyvážená, plná a přirozeně harmonická.', 'čistá filtrovaná voda, dýně Hokkaido 39 %, kokosové mléko 15 % (kokosový extrakt 70 %, voda, emulgátor E435), brambory 9 %, cibule 4 %, olivový olej, dýňový olej, petržel kořen, mořská sůl, třtinový cukr, zázvor, lahůdkové droždí, grepová šťáva, chilli, muškátový oříšek, hřebíček, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":283,"energy_kcal":68,"fat":4,"saturates":2.7,"carbohydrate":7.6,"sugars":2,"protein":1,"salt":0.8,"fibre":1.1}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 14, 'Do 14 dnů při zachování správného uskladnění (do 4 °C).', 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

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
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'kulajda', 'Kulajda',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Kulajda stojí na plném základu brambor a žampionů. Čerstvý kopr a vyvážené koření vytvářejí harmonickou chuť s čistým charakterem.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky krémových polévek s vyváženým charakterem', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Základ tvoří brambory a žampiony, které dávají polévce plnost a hloubku. Čerstvý kopr dodává typický bylinný akcent a podtrhuje charakter celé receptury. Struktura je krémová, chuť vyvážená a přirozeně plná.', 'čistá filtrovaná voda, brambory 20 %, kokosové mléko 15 % (kokosový extrakt 70 %, voda, emulgátor E435), žampiony 7 %, cibule 3 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":187,"energy_kcal":45,"fat":2.9,"saturates":2.6,"carbohydrate":4.1,"sugars":0.5,"protein":0.7,"salt":0.7,"fibre":0.5}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 14, 'Do 14 dnů při zachování správného uskladnění (do 4 °C).', 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

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
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'rajcatova-polevka', 'Rajčatová polévka',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Rajčatová polévka nabízí plnou chuť zralých rajčat, vyvážené koření a jemně krémovou strukturu.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky rajčatových polévek', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Základ tvoří kvalitní rajčata, která dávají polévce výraz a hloubku. Pečlivě zvolené koření doplňuje celkovou harmonii a podtrhuje plnost chuti. Struktura je jemná, chuť vyvážená a přirozeně plná.', 'čistá filtrovaná voda, pasírovaná rajčata 27 %, rajčatový protlak 7 %, brambory 7 %, kokosové mléko 7 % (kokosový extrakt 70 %, voda, emulgátor E435), cibule 5 %, petržel kořen, olivový olej, třtinový cukr, mořská sůl, česnek, libeček, pepř černý, kardamom, hřebíček, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":255,"energy_kcal":61,"fat":4.4,"saturates":1.6,"carbohydrate":5.1,"sugars":1.6,"protein":0.9,"salt":0.8,"fibre":0.7}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 14, 'Do 14 dnů při zachování správného uskladnění (do 4 °C).', 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

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
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'rajcatova-polevka-s-cervenou-repou', 'Rajčatová polévka s červenou řepou',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Rajčatová polévka s červenou řepou nabízí jemnou a přirozeně vyváženou chuť. Zralá rajčata tvoří výrazný základ, který červená řepa přirozeně zjemňuje a propojuje do hladkého celku.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky jemnějších rajčatových polévek', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Je jemná, kulatá a vyvážená. Rajčatový základ doplňuje červená řepa, která chuť přirozeně uhlazuje a propojuje do hladkého celku. Výsledkem je hebká struktura a příjemně plný charakter.', 'čistá filtrovaná voda, pasírovaná rajčata 17 %, brambory 13 %, kokosové mléko 13 % (kokosový extrakt 70 %, voda, emulgátor E435), červená řepa 9 %, rajčatový protlak 3 %, cibule, petržel kořen, mořská sůl, třtinový cukr, olivový olej, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', '{"energy_kj":189,"energy_kcal":45,"fat":2.9,"saturates":2.4,"carbohydrate":3.9,"sugars":2.6,"protein":0.9,"salt":0.8,"fibre":0.9}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 14, 'Do 14 dnů při zachování správného uskladnění (do 4 °C).', 35)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

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
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'gulasova-polevka-z-hlivy-ustricne', 'Gulášová polévka z hlívy ústřičné',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Gulášová polévka z hlívy ústřičné nabízí výraznou a plnou chuť. Hlíva dodává pevnou strukturu, rajčatový základ hloubku a uzená paprika charakteristickou intenzitu.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky výrazných a sytějších chutí', '- pro ty, kteří hledají gulášovou polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro vegany i vegetariány', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Má plnou a sytou chuť s výrazem uzené papriky a rajčatového základu. Hlíva ústřičná dodává přirozenou strukturu a vytváří harmonický celek. Chuť je koncentrovaná, vyvážená a příjemně zahřívací.', 'čistá filtrovaná voda, brambory 22 %, hlíva ústřičná (Pleurotus ostreatus) 8 %, cibule 5 %, rajčatový protlak 4 %, mořská sůl, dýňový olej, česnek, olivový olej, majoránka, kmín, lahůdkové droždí, paprika uzená, paprika sladká, chilli, pepř černý, skořice', '{"energy_kj":149,"energy_kcal":36,"fat":0.7,"saturates":0.1,"carbohydrate":5.4,"sugars":1.7,"protein":1.2,"salt":0.8,"fibre":1.1}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 14, 'Do 14 dnů při zachování správného uskladnění (do 4 °C).', 40)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

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
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'polevky'), 'spenatova-polevka', 'Špenátová polévka',
  'Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.', ARRAY['Špenátová polévka nabízí jemně krémovou a přirozeně plnou chuť. Kvalitní špenát tvoří její výrazný základ, který doplňuje jemná struktura a vyvážené koření.', '**Poctivá domácí polévka, kterou máte v lednici vždy připravenou. Stačí ohřát a servírovat.**', 'Připravujeme ji z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozené chuti jednotlivých ingrediencí.', '## Pro koho je vhodná', '- pro milovníky zeleninových krémových polévek', '- pro ty, kteří hledají veganskou (rostlinnou) polévku bez masa', '- pro rodiny, kanceláře i provozy, kde se počítá praktičnost', '- pro každého, kdo ocení kvalitní suroviny a čistou filtrovanou vodu']::text[], ARRAY['rostlinná receptura', 'přirozeně bezlepková', 'z čisté filtrované vody']::text[],
  'Špenát tvoří výrazný zeleninový základ, který doplňují brambory a pečlivě zvolené koření. Struktura je krémová, chuť vyvážená a čistá. Polévka působí svěže a harmonicky.', 'čistá filtrovaná voda, špenát 17 %, kokosové mléko 15 % (70 % kokosový extrakt, voda, emulgátor E435), brambory 13 %, cibule 4 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":210,"energy_kcal":50,"fat":3.2,"saturates":1.7,"carbohydrate":4.1,"sugars":0.7,"protein":1.1,"salt":0.7,"fibre":0.8}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 14, 'Do 14 dnů při zachování správného uskladnění (do 4 °C).', 50)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

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

-- ===== docs/eshop-catalog/51_caje.sql =====
-- ESHOP 1.0 — katalog: Čaje (Bylinný čaj Šaman, Zázvorový čaj, Lipový čaj, Heřmánkový čaj, Černý čaj Golden Nepal, Jasmínový zelený čaj, Ibiškový čaj, Meduňkový čaj s levandulí)
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

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/lipovy-caj.jpg', 'Lipový čaj', 0 FROM "products" WHERE "slug" = 'lipovy-caj'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'lipovy-caj' AND pi."url" = '/eshop/lipovy-caj.jpg');

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

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'caje'), 'jasminovy-zeleny-caj', 'Jasmínový zelený čaj',
  'Až 12 nápojů (22,40 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Jasmínový zelený čaj spojuje jemnost čaje Sencha s typickou vůní jasmínu a svěžím nádechem citronu. Výsledkem je plná, čistá chuť s lehkým květinovým charakterem a příjemně osvěžujícím dozvukem.', 'Chuť působí lehce, svěže a harmonicky.', '**Čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'jemná, vyvážená chuť']::text[],
  'Jemná, svěží chuť zeleného čaje Sencha s květinovou vůní jasmínu a lehkým citrusovým nádechem. Působí čistě, lehce a osvěžujícím dojmem.', 'čistá filtrovaná voda, třtinový cukr, citrónová šťáva, zelený čaj Sencha (Camellia sinensis), květ jasmínu (Jasminum officinale), regulátor kyselosti: kyselina citronová; antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":95,"energy_kcal":23,"fat":0,"saturates":0,"carbohydrate":5.7,"sugars":5.7,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', ARRAY['Obsahuje kofein – není vhodné pro děti, těhotné a kojící ženy.']::text[], '{}'::text[], 60, 'Do 2 měsíců při skladování v lednici do 4 °C.', 60)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'jasminovy-zeleny-caj'), 'jasminovy-zeleny-caj-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 269, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/jasminovy-zeleny-caj.jpg', 'Jasmínový zelený čaj', 0 FROM "products" WHERE "slug" = 'jasminovy-zeleny-caj'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'jasminovy-zeleny-caj' AND pi."url" = '/eshop/jasminovy-zeleny-caj.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'caje'), 'ibiskovy-caj', 'Ibiškový čaj',
  'Až 12 nápojů (20,80 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Ibiškový čaj přináší výraznou, svěží chuť ibišku s plným a osvěžujícím dozvukem. Výsledkem je vyvážená, plná chuť s přirozenou svěžestí.', 'Chuť působí svěže, výrazně a harmonicky.', '**Čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'výrazná, vyvážená chuť']::text[],
  'Ibiškový čaj má výraznou, svěží chuť s plným a osvěžujícím dozvukem.', 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, ibišek (Hibiscus), regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":113,"energy_kcal":27,"fat":0,"saturates":0,"carbohydrate":6.7,"sugars":6.7,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 60, 'Do 2 měsíců při skladování v lednici do 4 °C.', 70)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-caj'), 'ibiskovy-caj-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 249, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/ibiskovy-caj.jpg', 'Ibiškový čaj', 0 FROM "products" WHERE "slug" = 'ibiskovy-caj'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'ibiskovy-caj' AND pi."url" = '/eshop/ibiskovy-caj.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights",
  "taste_description", "ingredients", "nutrition", "nutrition_basis", "storage_instructions", "warnings", "allergens", "shelf_life_days", "shelf_life_note", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'caje'), 'medunkovy-caj-s-levanduli', 'Meduňkový čaj s levandulí',
  'Až 12 nápojů (20,80 Kč za nápoj). Jeden nápoj = 250 ml.', ARRAY['Meduňkový čaj s levandulí spojuje jemnou chuť meduňky s lehkou květinovou vůní levandule a svěžím nádechem citronu. Výsledkem je vyvážená, čistá chuť s jemným květinovým charakterem.', 'Chuť působí lehce a harmonicky.', '**Bylinný čaj, který máte v lednici vždy připravený. Stačí ohřát nebo podávat vychlazený – ideálně ve sklenici s ledem.**', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'bez umělých aromat a barviv', 'harmonická, jemná chuť']::text[],
  'Jemná, harmonická chuť meduňky s lehkým květinovým nádechem levandule působí svěže a vyváženě.', 'čistá filtrovaná voda, třtinový cukr, citronová šťáva, meduňka (Melissa officinalis), květ levandule (Lavandula angustifolia), regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', '{"energy_kj":94,"energy_kcal":22,"fat":0,"saturates":0,"carbohydrate":5.6,"sugars":5.6,"protein":0,"salt":0}'::jsonb, '100ml', 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě. Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.', '{}'::text[], '{}'::text[], 60, 'Do 2 měsíců při skladování v lednici do 4 °C.', 80)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "taste_description" = EXCLUDED."taste_description",
  "ingredients" = EXCLUDED."ingredients", "nutrition" = EXCLUDED."nutrition",
  "nutrition_basis" = EXCLUDED."nutrition_basis", "storage_instructions" = EXCLUDED."storage_instructions",
  "warnings" = EXCLUDED."warnings", "allergens" = EXCLUDED."allergens", "shelf_life_days" = EXCLUDED."shelf_life_days", "shelf_life_note" = EXCLUDED."shelf_life_note", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "package_description",
  "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-caj-s-levanduli'), 'medunkovy-caj-s-levanduli-3l', '3 l Rodinná zásoba (bag-in-box)', 'Ideální pro sdílení nebo více příležitostí.',
  'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.', 3000, 12, 249, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "package_description" = EXCLUDED."package_description",
  "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/medunkovy-caj-s-levanduli.jpg', 'Meduňkový čaj s levandulí', 0 FROM "products" WHERE "slug" = 'medunkovy-caj-s-levanduli'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'medunkovy-caj-s-levanduli' AND pi."url" = '/eshop/medunkovy-caj-s-levanduli.jpg');

-- ===== docs/eshop-payments/11_migration.sql =====
-- ESHOP 1.0 — platby a fakturace, KROK A (jen přidává, nic nemaže).
-- Schéma schválené vedením 5. 10. 2026 (ESHOP_FAKTURACE_NAVRH.md).
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou, nejdřív jen na
-- Preview (větev preview/claude/great-bell-ffjwo3), po kontrole
-- 10_before.sql. Jedna transakce: chyba = nic se nezmění. Kontrola po:
-- 12_after.sql. Vrácení: 19_rollback.sql.
--
-- Krok A je zpětně kompatibilní: dnešní kód (pokladna, Stripe, MojeBegina)
-- nové sloupce nezná a funguje dál. Povinný VS u e-shopové objednávky
-- (orders_eshop_requires_vs) přijde až v kroku B spolu s kódem, který VS
-- přiděluje.

-- ===== 1. Platební identifikátor objednávky (VS) =====
-- 8 číslic začínajících 7 (70000001, 70000002, …), přiděluje pokladna při
-- uložení objednávky: '7' || lpad(nextval('payment_vs_seq')::text, 7, '0').
CREATE SEQUENCE payment_vs_seq START 1 MINVALUE 1 MAXVALUE 9999999 NO CYCLE;
ALTER TABLE orders ADD COLUMN payment_vs text;
ALTER TABLE orders ADD CONSTRAINT orders_payment_vs_key UNIQUE (payment_vs);
ALTER TABLE orders ADD CONSTRAINT orders_payment_vs_format
  CHECK (payment_vs IS NULL OR payment_vs ~ '^7[0-9]{7}$');

-- VS je neměnný: jednou nastavený nejde přepsat ani smazat.
CREATE FUNCTION orders_payment_vs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.payment_vs IS NOT NULL AND NEW.payment_vs IS DISTINCT FROM OLD.payment_vs THEN
    RAISE EXCEPTION 'payment_vs je neměnný (objednávka %)', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_payment_vs_immutable BEFORE UPDATE OF payment_vs ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_payment_vs_immutable();

-- ===== 2. Platby: libovolný počet záznamů k objednávce =====
-- Jeden řádek = jedna transakce u jednoho zdroje. Směr peněz (direction)
-- a stav transakce (status) jsou dvě nezávislé veličiny; částka je vždy
-- kladná. Idempotence: UNIQUE (source, external_id).
CREATE TABLE payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 uuid REFERENCES orders(id),           -- NULL = přišlo, zatím nespárováno
  source                   text NOT NULL,                         -- 'stripe' | 'bank' | 'manual'
  external_id              text NOT NULL,                         -- ID u zdroje: cs_… / re_… / účet:ID pohybu / token formuláře
  method                   text NOT NULL,                         -- 'card' | 'bank_transfer' | 'cash'
  direction                text NOT NULL,                         -- 'inflow' = příjem | 'outflow' = vratka zákazníkovi
  status                   text NOT NULL,                         -- 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'superseded' | 'refunded'
  amount_hal               bigint NOT NULL,                       -- haléře, vždy > 0
  currency                 text NOT NULL DEFAULT 'CZK',
  vs                       text,                                  -- VS, se kterým peníze přišly / odešly
  refund_of_payment_id     uuid REFERENCES payments(id),          -- vratka → původní příjem
  superseded_by_payment_id uuid REFERENCES payments(id),          -- ruční potvrzení doložené importem banky
  match_status             text NOT NULL DEFAULT 'matched',       -- 'matched' | 'unmatched' | 'needs_review'
  occurred_at              timestamptz,                           -- kdy peníze skutečně přišly / odešly
  recorded_by_user_id      text,                                  -- kdo zapsal ruční záznam / párování
  note                     text,
  raw                      jsonb,                                 -- výřez ze Stripe / banky, NIKDY údaje o kartě
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_source_external_key UNIQUE (source, external_id),
  CONSTRAINT payments_source_check     CHECK (source IN ('stripe', 'bank', 'manual')),
  CONSTRAINT payments_method_check     CHECK (method IN ('card', 'bank_transfer', 'cash')),
  CONSTRAINT payments_direction_check  CHECK (direction IN ('inflow', 'outflow')),
  CONSTRAINT payments_status_check     CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled', 'superseded', 'refunded')),
  CONSTRAINT payments_match_check      CHECK (match_status IN ('matched', 'unmatched', 'needs_review')),
  CONSTRAINT payments_currency_czk     CHECK (currency = 'CZK'),
  CONSTRAINT payments_amount_positive  CHECK (amount_hal > 0),
  CONSTRAINT payments_matched_has_order CHECK (match_status <> 'matched' OR order_id IS NOT NULL),
  -- vratka je vždy odchozí; „refunded“ může být jen příjem, který byl celý vrácen
  CONSTRAINT payments_refund_is_outflow CHECK (refund_of_payment_id IS NULL OR direction = 'outflow'),
  CONSTRAINT payments_refunded_is_inflow CHECK (status <> 'refunded' OR direction = 'inflow'),
  -- „superseded“ právě tehdy, když je uvedeno, čím byl záznam nahrazen
  CONSTRAINT payments_superseded_has_link CHECK ((status = 'superseded') = (superseded_by_payment_id IS NOT NULL)),
  CONSTRAINT payments_not_self_superseded CHECK (superseded_by_payment_id IS DISTINCT FROM id),
  -- peníze, které se skutečně pohnuly, mají čas pohybu
  CONSTRAINT payments_settled_has_time CHECK (status NOT IN ('succeeded', 'superseded', 'refunded') OR occurred_at IS NOT NULL),
  CONSTRAINT payments_manual_has_user  CHECK (source <> 'manual' OR recorded_by_user_id IS NOT NULL),
  CONSTRAINT payments_vs_format        CHECK (vs IS NULL OR vs ~ '^[0-9]{1,10}$')
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE INDEX payments_vs_idx ON payments (vs);
CREATE INDEX payments_needs_attention_idx ON payments (created_at) WHERE match_status <> 'matched';

-- Stav úhrady objednávky — počítá se, neukládá se ručně.
-- Příjem se počítá, pokud peníze přišly (succeeded, nebo refunded = přišly
-- a později byly vráceny; vratka je pak samostatný odchozí řádek). Odchozí
-- vratka se odečte, jen když proběhla (succeeded). Pokusy (pending),
-- neúspěšné, zrušené a nahrazené záznamy se nepočítají nikdy.
CREATE VIEW order_payment_balance AS
WITH sums AS (
  SELECT o.id AS order_id,
         o.total_kc::bigint * 100 AS required_hal,
         coalesce(sum(p.amount_hal) FILTER (WHERE p.direction = 'inflow'  AND p.status IN ('succeeded', 'refunded')), 0)::bigint AS received_hal,
         coalesce(sum(p.amount_hal) FILTER (WHERE p.direction = 'outflow' AND p.status = 'succeeded'), 0)::bigint AS refunded_hal
  FROM orders o
  LEFT JOIN payments p ON p.order_id = o.id AND p.match_status = 'matched'
  GROUP BY o.id, o.total_kc
)
SELECT order_id, required_hal, received_hal, refunded_hal,
       received_hal - refunded_hal AS net_hal,
       CASE
         WHEN refunded_hal > 0 AND received_hal - refunded_hal <= 0 THEN 'refunded'
         WHEN received_hal - refunded_hal <= 0 THEN 'unpaid'
         WHEN received_hal - refunded_hal < required_hal THEN 'partially_paid'
         WHEN received_hal - refunded_hal = required_hal THEN 'paid'
         ELSE 'overpaid'
       END AS balance_state
FROM sums;

-- ===== 3. Zákazníci pro fakturaci a jejich kontakty u poskytovatelů =====
CREATE TABLE invoice_customers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL,                                 -- 'person' | 'company'
  email_normalized text,                                          -- lower(trim(e-mail))
  ico              text,                                          -- jen firma
  name             text NOT NULL,                                 -- poslední známé jméno / název
  organization_id  uuid REFERENCES organizations(id),             -- firma, kterou MojeBegina už zná
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_customers_kind_check CHECK (kind IN ('person', 'company')),
  CONSTRAINT invoice_customers_ico_format CHECK (ico IS NULL OR ico ~ '^[0-9]{8}$'),
  CONSTRAINT invoice_customers_person_by_email CHECK (kind <> 'person' OR (email_normalized IS NOT NULL AND ico IS NULL)),
  CONSTRAINT invoice_customers_company_key CHECK (kind <> 'company' OR ico IS NOT NULL OR email_normalized IS NOT NULL)
);
-- soukromá osoba: jeden zákazník na e-mail; firma: na IČO, firma bez IČO na e-mail
CREATE UNIQUE INDEX invoice_customers_person_email_key ON invoice_customers (email_normalized) WHERE kind = 'person';
CREATE UNIQUE INDEX invoice_customers_company_ico_key ON invoice_customers (ico) WHERE kind = 'company' AND ico IS NOT NULL;
CREATE UNIQUE INDEX invoice_customers_company_email_key ON invoice_customers (email_normalized) WHERE kind = 'company' AND ico IS NULL;

-- Kontakt zákazníka u poskytovatele (dnes iDoklad) — obecná vazba.
CREATE TABLE invoice_customer_refs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES invoice_customers(id),
  provider    text NOT NULL,                                      -- 'idoklad' (formát, ne pevný seznam)
  external_id text NOT NULL,                                      -- ID kontaktu u poskytovatele
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_customer_refs_provider_format CHECK (provider ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT invoice_customer_refs_external_key UNIQUE (provider, external_id),
  CONSTRAINT invoice_customer_refs_one_per_provider UNIQUE (customer_id, provider)
);

-- ===== 4. Faktury: prodejní faktura i budoucí dobropis =====
-- Stávající řádky (importované faktury) dostanou origin = 'import',
-- doc_state = 'issued', document_type = 'invoice' — beze změny obsahu.
ALTER TABLE invoices DROP CONSTRAINT invoices_order_id_unique;   -- nahrazuje částečný index níže
ALTER TABLE invoices
  ALTER COLUMN organization_id DROP NOT NULL,                    -- soukromý zákazník bez IČO
  ALTER COLUMN invoice_number DROP NOT NULL,                     -- číslo přidělí až poskytovatel
  ALTER COLUMN issued_at DROP NOT NULL,
  ALTER COLUMN status DROP NOT NULL;                             -- historický stav z importu; nový kód používá doc_state
ALTER TABLE invoices
  ADD COLUMN document_type       text NOT NULL DEFAULT 'invoice', -- 'invoice' | 'credit_note'
  ADD COLUMN corrects_invoice_id uuid REFERENCES invoices(id),    -- dobropis → opravovaná faktura
  ADD COLUMN origin              text NOT NULL DEFAULT 'import',  -- 'eshop' | 'import' | 'manual'
  ADD COLUMN doc_state           text NOT NULL DEFAULT 'issued',  -- 'draft' | 'issued' | 'void'
  ADD COLUMN payment_vs          text,                            -- = orders.payment_vs
  ADD COLUMN customer_id         uuid REFERENCES invoice_customers(id),
  ADD COLUMN pdf_sent_at         timestamptz,                     -- kdy MojeBegina poslala PDF zákazníkovi
  ADD COLUMN updated_at          timestamptz NOT NULL DEFAULT now();
-- výchozí hodnoty platí jen pro stávající řádky; nový kód je uvádí vždy
ALTER TABLE invoices ALTER COLUMN origin DROP DEFAULT, ALTER COLUMN doc_state SET DEFAULT 'draft';
ALTER TABLE invoices ADD CONSTRAINT invoices_document_type_check CHECK (document_type IN ('invoice', 'credit_note'));
ALTER TABLE invoices ADD CONSTRAINT invoices_origin_check CHECK (origin IN ('eshop', 'import', 'manual'));
ALTER TABLE invoices ADD CONSTRAINT invoices_doc_state_check CHECK (doc_state IN ('draft', 'issued', 'void'));
ALTER TABLE invoices ADD CONSTRAINT invoices_credit_note_has_origin
  CHECK ((document_type = 'credit_note') = (corrects_invoice_id IS NOT NULL));
ALTER TABLE invoices ADD CONSTRAINT invoices_issued_has_number
  CHECK (doc_state <> 'issued' OR (invoice_number IS NOT NULL AND issued_at IS NOT NULL));
-- jedna ostrá prodejní faktura na objednávku; dobropisů může být víc
CREATE UNIQUE INDEX invoices_one_sales_invoice_per_order
  ON invoices (order_id) WHERE document_type = 'invoice' AND doc_state <> 'void';
CREATE INDEX invoices_order_idx ON invoices (order_id);

-- ===== 5. Obecná vazba dokladu na externího poskytovatele =====
-- Dnes iDoklad; jiný poskytovatel = jen jiná hodnota provider. Historie
-- pokusů zůstává (nepovedený / zrušený pokus = state 'void'), aktivní
-- vazba je na doklad nejvýš jedna.
CREATE TABLE invoice_provider_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoices(id),
  provider        text NOT NULL,                                  -- 'idoklad'
  state           text NOT NULL DEFAULT 'pending',                -- 'pending' | 'dry_run' | 'issued' | 'failed' | 'void'
  external_id     text,                                           -- ID dokladu u poskytovatele
  external_number text,                                           -- číslo dokladu z řady poskytovatele
  number_series   text,                                           -- řada (u iDokladu e-shopová), pro audit
  issued_at       timestamptz,                                    -- datum vystavení podle poskytovatele
  external_url    text,                                           -- odkaz na doklad u poskytovatele
  pdf_storage_key text,                                           -- kde máme uložené PDF
  pdf_sha256      text,
  pdf_fetched_at  timestamptz,
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,                                           -- očištěná chyba, bez tokenů
  last_error_at   timestamptz,
  next_attempt_at timestamptz,
  request_payload jsonb,                                          -- co jsme poslali / poslali bychom (dry-run)
  response_ref    jsonb,                                          -- reference z odpovědi (bez tajných údajů)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_provider_links_provider_format CHECK (provider ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT invoice_provider_links_state_check CHECK (state IN ('pending', 'dry_run', 'issued', 'failed', 'void')),
  CONSTRAINT invoice_provider_links_issued_complete
    CHECK (state <> 'issued' OR (external_id IS NOT NULL AND external_number IS NOT NULL AND issued_at IS NOT NULL)),
  CONSTRAINT invoice_provider_links_failed_has_error CHECK (state <> 'failed' OR last_error IS NOT NULL),
  CONSTRAINT invoice_provider_links_attempts_nonnegative CHECK (attempts >= 0)
);
CREATE UNIQUE INDEX invoice_provider_links_one_active ON invoice_provider_links (invoice_id) WHERE state <> 'void';
CREATE UNIQUE INDEX invoice_provider_links_external_id_key ON invoice_provider_links (provider, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX invoice_provider_links_external_number_key ON invoice_provider_links (provider, external_number) WHERE external_number IS NOT NULL;
CREATE INDEX invoice_provider_links_retry_idx ON invoice_provider_links (next_attempt_at) WHERE state IN ('pending', 'failed');

COMMIT;

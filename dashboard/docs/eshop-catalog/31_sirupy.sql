-- ESHOP 1.0 — katalog: Bylinné sirupy (7 produktů, 14 balení, 7 fotek)
-- a úvodní text kategorie. Data z begina.cz dodaná vedením 3. 10. 2026
-- (snímky kategorie a detailu Bylinný sirup Šaman).
--
-- Balení: 3 l Rodinná zásoba (bag-in-box, až 150 nápojů) a 750 ml
-- Praktické balení (až 37 nápojů). Ceny podle rozpětí na begina.cz:
-- 750 ml = 199 Kč, 3 l = 549 Kč (Šaman, Lipový, Heřmánkový, Meduňkový)
-- nebo 499 Kč (Zázvorový, Ibiškový, Šípkový). Popis a vlastnosti zatím
-- jen u Šamana; složení, alergeny, trvanlivost = „Doplníme“.
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou (jedna
-- transakce: chyba = nic se nezmění). Idempotentní — opakované spuštění
-- nic nezdvojí. Kontrola před: 30_sirupy_before.sql, po: 32_sirupy_after.sql.
-- Fotky jsou v kódu (public/eshop/<slug>.jpg).
BEGIN;

UPDATE "product_categories" SET "intro" = ARRAY['Bylinné sirupy Begina připravujeme řemeslně z mimořádně silných výluhů a čisté filtrované vody, která nechává vyniknout přirozenou chuť každé ingredience. Jako český výrobce klademe důraz na čistotu složení – naše sirupy jsou bez umělých aromat, barviv a zbytečných konzervantů.', 'Každá receptura je navržena tak, aby chutě harmonicky vynikly v domácích limonádách, horkých nápojích i při dalším použití v kuchyni a zachovaly si svou plnost, svěžest a jedinečný charakter.', 'Pro dokonalý zážitek doporučujeme naše zlaté pravidlo ředění 1:10, se kterým si vytvoříte poctivý domácí drink s duší přírody.']::text[], "updated_at" = now()
WHERE "slug" = 'sirupy';

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'bylinny-sirup-saman', 'Bylinný sirup Šaman',
  'Až 150 nápojů z jednoho balení (při doporučeném ředění 1:10). 200 ml nápoje při 3l balení vyjde přibližně na 3,70 Kč.', ARRAY['Bylinný sirup Šaman je výrazný sirup s hlubokým a soustředěným charakterem. Základ tvoří šípek, který doplňují čaga a ženšen, zatímco zázvor dodává chuti jemný kořeněný tón. Výsledkem je vyvážená a kultivovaná chuť s dlouhým dozvukem.', 'Stačí smíchat s vodou a během chvíle vznikne poctivá domácí limonáda nebo hřejivý bylinný nápoj.', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.']::text[], ARRAY['40 % bylinného výluhu', 'z čisté filtrované vody', 'bez umělých aromat a barviv', 'až 150 nápojů z jednoho balení']::text[], 10)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman'), 'bylinny-sirup-saman-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'bylinny-sirup-saman'), 'bylinny-sirup-saman-750ml', '750 ml Praktické balení', 'Až 37 nápojů', 750, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/bylinny-sirup-saman.jpg', 'Bylinný sirup Šaman', 0 FROM "products" WHERE "slug" = 'bylinny-sirup-saman'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'bylinny-sirup-saman' AND pi."url" = '/eshop/bylinny-sirup-saman.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'zazvorovy-sirup', 'Zázvorový sirup',
  NULL, '{}'::text[], '{}'::text[], 20)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup'), 'zazvorovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů', 3000, 150, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'zazvorovy-sirup'), 'zazvorovy-sirup-750ml', '750 ml Praktické balení', 'Až 37 nápojů', 750, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/zazvorovy-sirup.jpg', 'Zázvorový sirup', 0 FROM "products" WHERE "slug" = 'zazvorovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'zazvorovy-sirup' AND pi."url" = '/eshop/zazvorovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'lipovy-sirup', 'Lipový sirup',
  NULL, '{}'::text[], '{}'::text[], 30)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup'), 'lipovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'lipovy-sirup'), 'lipovy-sirup-750ml', '750 ml Praktické balení', 'Až 37 nápojů', 750, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/lipovy-sirup.jpg', 'Lipový sirup', 0 FROM "products" WHERE "slug" = 'lipovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'lipovy-sirup' AND pi."url" = '/eshop/lipovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'ibiskovy-sirup', 'Ibiškový sirup',
  NULL, '{}'::text[], '{}'::text[], 40)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup'), 'ibiskovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů', 3000, 150, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'ibiskovy-sirup'), 'ibiskovy-sirup-750ml', '750 ml Praktické balení', 'Až 37 nápojů', 750, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/ibiskovy-sirup.jpg', 'Ibiškový sirup', 0 FROM "products" WHERE "slug" = 'ibiskovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'ibiskovy-sirup' AND pi."url" = '/eshop/ibiskovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'sipkovy-sirup', 'Šípkový sirup',
  NULL, '{}'::text[], '{}'::text[], 50)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup'), 'sipkovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů', 3000, 150, 499, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'sipkovy-sirup'), 'sipkovy-sirup-750ml', '750 ml Praktické balení', 'Až 37 nápojů', 750, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/sipkovy-sirup.jpg', 'Šípkový sirup', 0 FROM "products" WHERE "slug" = 'sipkovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'sipkovy-sirup' AND pi."url" = '/eshop/sipkovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'hermankovy-sirup', 'Heřmánkový sirup',
  NULL, '{}'::text[], '{}'::text[], 60)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup'), 'hermankovy-sirup-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'hermankovy-sirup'), 'hermankovy-sirup-750ml', '750 ml Praktické balení', 'Až 37 nápojů', 750, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/hermankovy-sirup.jpg', 'Heřmánkový sirup', 0 FROM "products" WHERE "slug" = 'hermankovy-sirup'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'hermankovy-sirup' AND pi."url" = '/eshop/hermankovy-sirup.jpg');

INSERT INTO "products" ("category_id", "slug", "name", "short_description", "description", "highlights", "sort_order")
VALUES ((SELECT "id" FROM "product_categories" WHERE "slug" = 'sirupy'), 'medunkovy-sirup-s-levanduli', 'Meduňkový sirup s levandulí',
  NULL, '{}'::text[], '{}'::text[], 70)
ON CONFLICT ("slug") DO UPDATE SET "category_id" = EXCLUDED."category_id", "name" = EXCLUDED."name",
  "short_description" = EXCLUDED."short_description", "description" = EXCLUDED."description",
  "highlights" = EXCLUDED."highlights", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'), 'medunkovy-sirup-s-levanduli-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 150 nápojů', 3000, 150, 549, 10)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_variants" ("product_id", "sku", "label", "short_note", "volume_ml", "servings", "price_b2c_kc", "sort_order")
VALUES ((SELECT "id" FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'), 'medunkovy-sirup-s-levanduli-750ml', '750 ml Praktické balení', 'Až 37 nápojů', 750, 37, 199, 20)
ON CONFLICT ("sku") DO UPDATE SET "product_id" = EXCLUDED."product_id", "label" = EXCLUDED."label",
  "short_note" = EXCLUDED."short_note", "volume_ml" = EXCLUDED."volume_ml", "servings" = EXCLUDED."servings",
  "price_b2c_kc" = EXCLUDED."price_b2c_kc", "sort_order" = EXCLUDED."sort_order", "is_active" = true, "updated_at" = now();

INSERT INTO "product_images" ("product_id", "url", "alt", "sort_order")
SELECT "id", '/eshop/medunkovy-sirup-s-levanduli.jpg', 'Meduňkový sirup s levandulí', 0 FROM "products" WHERE "slug" = 'medunkovy-sirup-s-levanduli'
AND NOT EXISTS (SELECT 1 FROM "product_images" pi JOIN "products" p ON p."id" = pi."product_id"
  WHERE p."slug" = 'medunkovy-sirup-s-levanduli' AND pi."url" = '/eshop/medunkovy-sirup-s-levanduli.jpg');

COMMIT;

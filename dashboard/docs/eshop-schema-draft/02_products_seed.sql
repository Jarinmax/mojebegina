-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Krok 2 (drizzle 0012): naplnění katalogu. VYGENEROVÁNO z lib/eshop/catalog.ts (26. 9. 2026),
-- ručně neupravovat. Idempotentní: opakované spuštění data aktualizuje, neduplikuje.

-- 1) Kategorie
INSERT INTO product_categories (slug, name, intro, detail_sections, image_url, sort_order)
VALUES ('polevky', 'Čerstvé polévky', '{}'::text[], NULL, '/eshop/kategorie-polevky.jpg', 10)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, intro = EXCLUDED.intro, detail_sections = EXCLUDED.detail_sections,
  image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_categories (slug, name, intro, detail_sections, image_url, sort_order)
VALUES ('sirupy', 'Bylinné sirupy', '{}'::text[], NULL, '/eshop/kategorie-sirupy.jpg', 20)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, intro = EXCLUDED.intro, detail_sections = EXCLUDED.detail_sections,
  image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_categories (slug, name, intro, detail_sections, image_url, sort_order)
VALUES ('caje', 'Čaje', '{}'::text[], NULL, '/eshop/kategorie-caje.jpg', 30)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, intro = EXCLUDED.intro, detail_sections = EXCLUDED.detail_sections,
  image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_categories (slug, name, intro, detail_sections, image_url, sort_order)
VALUES ('ovocne-napoje', 'Ovocné nápoje', '{}'::text[], NULL, '/eshop/kategorie-ovocne-napoje.jpg', 40)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, intro = EXCLUDED.intro, detail_sections = EXCLUDED.detail_sections,
  image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_categories (slug, name, intro, detail_sections, image_url, sort_order)
VALUES ('koktejly', 'Alkoholické koktejly', ARRAY['Alkoholické koktejly Begina spojují kvalitní destiláty, čisté ovocné šťávy a precizně vyvážené chutě.', 'Každý nápoj je postavený tak, aby působil přirozeně, čistě a zároveň výrazně.']::text[], '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Alkoholické koktejly Begina jsou praktické řešení pro:","Díky bag-in-box balení lze koktejl jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, '/eshop/kategorie-koktejly.jpg', 50)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, intro = EXCLUDED.intro, detail_sections = EXCLUDED.detail_sections,
  image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order, updated_at = now();

-- 2) Produkty
INSERT INTO products (category_id, slug, name, short_description, description, highlights, taste_description,
  ingredients, allergens, storage_instructions, shelf_life_note, alcohol_percent, is_age_restricted, warnings, sort_order)
VALUES ((SELECT id FROM product_categories WHERE slug = 'polevky'), 'dynova-polevka', 'Dýňová polévka', 'Krémová polévka z dýně.',
  '{}'::text[], '{}'::text[], NULL,
  NULL, NULL, NULL, NULL,
  NULL, false, '{}'::text[], 10)
ON CONFLICT (slug) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name, short_description = EXCLUDED.short_description,
  description = EXCLUDED.description, highlights = EXCLUDED.highlights, taste_description = EXCLUDED.taste_description,
  ingredients = EXCLUDED.ingredients, allergens = EXCLUDED.allergens, storage_instructions = EXCLUDED.storage_instructions,
  shelf_life_note = EXCLUDED.shelf_life_note, alcohol_percent = EXCLUDED.alcohol_percent,
  is_age_restricted = EXCLUDED.is_age_restricted, warnings = EXCLUDED.warnings, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO products (category_id, slug, name, short_description, description, highlights, taste_description,
  ingredients, allergens, storage_instructions, shelf_life_note, alcohol_percent, is_age_restricted, warnings, sort_order)
VALUES ((SELECT id FROM product_categories WHERE slug = 'polevky'), 'kulajda', 'Kulajda', 'Tradiční jihočeská polévka.',
  '{}'::text[], '{}'::text[], NULL,
  NULL, NULL, NULL, NULL,
  NULL, false, '{}'::text[], 20)
ON CONFLICT (slug) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name, short_description = EXCLUDED.short_description,
  description = EXCLUDED.description, highlights = EXCLUDED.highlights, taste_description = EXCLUDED.taste_description,
  ingredients = EXCLUDED.ingredients, allergens = EXCLUDED.allergens, storage_instructions = EXCLUDED.storage_instructions,
  shelf_life_note = EXCLUDED.shelf_life_note, alcohol_percent = EXCLUDED.alcohol_percent,
  is_age_restricted = EXCLUDED.is_age_restricted, warnings = EXCLUDED.warnings, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO products (category_id, slug, name, short_description, description, highlights, taste_description,
  ingredients, allergens, storage_instructions, shelf_life_note, alcohol_percent, is_age_restricted, warnings, sort_order)
VALUES ((SELECT id FROM product_categories WHERE slug = 'polevky'), 'rajcatova-polevka', 'Rajčatová polévka', 'Polévka z rajčat.',
  '{}'::text[], '{}'::text[], NULL,
  NULL, NULL, NULL, NULL,
  NULL, false, '{}'::text[], 30)
ON CONFLICT (slug) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name, short_description = EXCLUDED.short_description,
  description = EXCLUDED.description, highlights = EXCLUDED.highlights, taste_description = EXCLUDED.taste_description,
  ingredients = EXCLUDED.ingredients, allergens = EXCLUDED.allergens, storage_instructions = EXCLUDED.storage_instructions,
  shelf_life_note = EXCLUDED.shelf_life_note, alcohol_percent = EXCLUDED.alcohol_percent,
  is_age_restricted = EXCLUDED.is_age_restricted, warnings = EXCLUDED.warnings, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO products (category_id, slug, name, short_description, description, highlights, taste_description,
  ingredients, allergens, storage_instructions, shelf_life_note, alcohol_percent, is_age_restricted, warnings, sort_order)
VALUES ((SELECT id FROM product_categories WHERE slug = 'koktejly'), 'svarak-deluxe', 'Svařák Deluxe', 'Výrazný zahřívací nápoj z červeného vína s ovocem a kořením.',
  ARRAY['Svařák Deluxe je výrazný zahřívací nápoj, ve kterém se propojuje kvalitní červené víno s ovocnými tóny pomeranče, grepu a citronu. Koření jako skořice, hřebíček, badyán, kardamom, zázvor a vanilka dotváří jeho charakter a přináší bohatý chuťový zážitek.', 'Každý doušek působí příjemným a hřejivým dojmem a přirozeně zapadá do zimní atmosféry i večerní pohody.', 'Prémiový nápoj, který máte v lednici vždy připravený. Stačí ohřát. Výborný i chlazený s ledem.']::text[], ARRAY['bez umělých aromat a barviv', 'plná, vyvážená chuť', 'stačí jemně ohřát']::text[], 'Plná a vyvážená chuť červeného vína s jemnými tóny pomeranče, grepu a citronu, doplněná hřejivým kořením, které vytváří bohatý a harmonický chuťový zážitek.',
  'červené víno, pomerančová šťáva, grepová šťáva, citronová šťáva, třtinový cukr, skořice, zázvor, kardamom, hřebíček, badyán, vanilka, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', NULL, 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.', NULL,
  7.5, true, ARRAY['Není určeno pro děti, těhotné a kojící ženy.']::text[], 10)
ON CONFLICT (slug) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name, short_description = EXCLUDED.short_description,
  description = EXCLUDED.description, highlights = EXCLUDED.highlights, taste_description = EXCLUDED.taste_description,
  ingredients = EXCLUDED.ingredients, allergens = EXCLUDED.allergens, storage_instructions = EXCLUDED.storage_instructions,
  shelf_life_note = EXCLUDED.shelf_life_note, alcohol_percent = EXCLUDED.alcohol_percent,
  is_age_restricted = EXCLUDED.is_age_restricted, warnings = EXCLUDED.warnings, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO products (category_id, slug, name, short_description, description, highlights, taste_description,
  ingredients, allergens, storage_instructions, shelf_life_note, alcohol_percent, is_age_restricted, warnings, sort_order)
VALUES ((SELECT id FROM product_categories WHERE slug = 'koktejly'), 'lady-carneval', 'Lady Carneval', 'Grepový koktejl s vodkou a Aperolem.',
  ARRAY['Grepový alkoholický koktejl Lady Carneval v sobě spojuje kvalitní vodku, italský Aperol a grepovou šťávu. Vzniká tak harmonický drink s výrazným citrusovým charakterem.', 'Každý doušek přináší osvěžující chuťový zážitek, který se hodí pro chvíle s přáteli i jako stylové osvěžení pro každou příležitost.', 'Prémiový nápoj, který máte v lednici vždy připravený. Stačí nalít do sklenice s ledem.', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'ideální pro podávání s ledem', 'plná, osvěžující chuť']::text[], 'Grepový alkoholický koktejl Lady Carneval má výraznou citrusovou chuť s příjemnou svěžestí grepu a jemně nasládlým dozvukem. Vyvážené spojení vodky, Aperolu a ovocných tónů vytváří harmonický a osvěžující drink, který působí lehce a elegantně.',
  'čistá filtrovaná voda, vodka, grepová šťáva, Aperol (pitná voda, cukr, líh, aromata, barviva: E110, E124), citronová šťáva, třtinový cukr, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', NULL, 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.', NULL,
  7.2, true, ARRAY['Není určeno pro děti, těhotné a kojící ženy.']::text[], 20)
ON CONFLICT (slug) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name, short_description = EXCLUDED.short_description,
  description = EXCLUDED.description, highlights = EXCLUDED.highlights, taste_description = EXCLUDED.taste_description,
  ingredients = EXCLUDED.ingredients, allergens = EXCLUDED.allergens, storage_instructions = EXCLUDED.storage_instructions,
  shelf_life_note = EXCLUDED.shelf_life_note, alcohol_percent = EXCLUDED.alcohol_percent,
  is_age_restricted = EXCLUDED.is_age_restricted, warnings = EXCLUDED.warnings, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO products (category_id, slug, name, short_description, description, highlights, taste_description,
  ingredients, allergens, storage_instructions, shelf_life_note, alcohol_percent, is_age_restricted, warnings, sort_order)
VALUES ((SELECT id FROM product_categories WHERE slug = 'koktejly'), 'granatovy-bond', 'Granátový Bond', 'Ovocný koktejl s vodkou a granátovým jablkem.',
  '{}'::text[], '{}'::text[], 'Granátový Bond má plnou, ovocnou chuť s výrazným tónem granátového jablka, který se postupně rozvíjí do jemně nasládlého a hladkého závěru. Jako alkoholický koktejl s granátovým jablkem působí elegantně, intenzivně a zanechává dlouhý, příjemný dozvuk.',
  'čistá filtrovaná voda, vodka, šťáva z granátového jablka, třtinový cukr, citronová šťáva, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C)', NULL, 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.', NULL,
  6.7, true, ARRAY['Není určeno pro děti, těhotné a kojící ženy.']::text[], 30)
ON CONFLICT (slug) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name, short_description = EXCLUDED.short_description,
  description = EXCLUDED.description, highlights = EXCLUDED.highlights, taste_description = EXCLUDED.taste_description,
  ingredients = EXCLUDED.ingredients, allergens = EXCLUDED.allergens, storage_instructions = EXCLUDED.storage_instructions,
  shelf_life_note = EXCLUDED.shelf_life_note, alcohol_percent = EXCLUDED.alcohol_percent,
  is_age_restricted = EXCLUDED.is_age_restricted, warnings = EXCLUDED.warnings, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO products (category_id, slug, name, short_description, description, highlights, taste_description,
  ingredients, allergens, storage_instructions, shelf_life_note, alcohol_percent, is_age_restricted, warnings, sort_order)
VALUES ((SELECT id FROM product_categories WHERE slug = 'koktejly'), 'kosmopolitan', 'Kosmopolitan', 'Brusinkový koktejl s vodkou a citrusy.',
  ARRAY['Kosmopolitan je ikonický alkoholický koktejl, který spojuje kvalitní vodku, brusinkovou a citronovou šťávu. Vzniká tak harmonický drink s výrazným ovocně-citrusovým charakterem a jemně nasládlým dozvukem.', 'Každý doušek přináší osvěžující chuťový zážitek, který se hodí pro chvíle s přáteli i jako stylové osvěžení pro každou příležitost.', 'Prémiový nápoj, který máte v lednici vždy připravený. Stačí nalít do sklenice s ledem.', 'Připravujeme ho z kvalitních surovin a čisté filtrované vody, která nechává vyniknout přirozený charakter jednotlivých ingrediencí.']::text[], ARRAY['z čisté filtrované vody', 'ideální pro podávání s ledem', 'bez umělých aromat a barviv', 'plná, osvěžující chuť']::text[], 'Kosmopolitan má výraznou ovocně-citrusovou chuť se svěžestí brusinek a jemně nasládlým dozvukem. Působí lehce, elegantně a dodává každému okamžiku nádech sebevědomí a stylu.',
  'čistá filtrovaná voda, brusinková šťáva, jablečná šťáva, vodka, citronová šťáva, třtinový cukr, regulátor kyselosti: kyselina citronová, antioxidant: kyselina askorbová (vitamin C), přírodní aroma', NULL, 'Skladujte v chladu při teplotě do 4 °C, a to i před otevřením. Po otevření spotřebujte co nejdříve. Určeno k přímé spotřebě.', NULL,
  6.3, true, ARRAY['Není určeno pro děti, těhotné a kojící ženy.']::text[], 40)
ON CONFLICT (slug) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name, short_description = EXCLUDED.short_description,
  description = EXCLUDED.description, highlights = EXCLUDED.highlights, taste_description = EXCLUDED.taste_description,
  ingredients = EXCLUDED.ingredients, allergens = EXCLUDED.allergens, storage_instructions = EXCLUDED.storage_instructions,
  shelf_life_note = EXCLUDED.shelf_life_note, alcohol_percent = EXCLUDED.alcohol_percent,
  is_age_restricted = EXCLUDED.is_age_restricted, warnings = EXCLUDED.warnings, sort_order = EXCLUDED.sort_order, updated_at = now();

-- 3) Balení (SKU) — objem a počet nápojů odvozené z názvu balení
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'dynova-polevka'), 'dynova-polevka', NULL, NULL, NULL,
  NULL, NULL, 379, 10)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'kulajda'), 'kulajda', NULL, NULL, NULL,
  NULL, NULL, 379, 10)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'rajcatova-polevka'), 'rajcatova-polevka', NULL, NULL, NULL,
  NULL, NULL, 379, 10)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'svarak-deluxe'), 'svarak-deluxe-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 15 nápojů po 200 ml', 'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.',
  3000, 15, 499, 10)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'svarak-deluxe'), 'svarak-deluxe-500ml', '500 ml Praktické balení', '2–3 nápoje', 'Lehké a nerozbitné balení vhodné na cesty nebo pro menší spotřebu.',
  500, NULL, 129, 20)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'lady-carneval'), 'lady-carneval-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 15 nápojů po 200 ml', 'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.',
  3000, 15, 799, 10)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'lady-carneval'), 'lady-carneval-500ml', '500 ml Praktické balení', '2–3 nápoje', 'Lehké a nerozbitné balení vhodné na cesty nebo pro menší spotřebu.',
  500, NULL, 169, 20)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'granatovy-bond'), 'granatovy-bond-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 15 nápojů po 200 ml', 'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.',
  3000, 15, 799, 10)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'granatovy-bond'), 'granatovy-bond-500ml', '500 ml Praktické balení', '2–3 nápoje', 'Lehké a nerozbitné balení vhodné na cesty nebo pro menší spotřebu.',
  500, NULL, 169, 20)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'kosmopolitan'), 'kosmopolitan-3l', '3 l Rodinná zásoba (bag-in-box)', 'Až 15 nápojů po 200 ml', 'Pro snadnou manipulaci a bezpečné uložení. Speciální balení bez přístupu vzduchu pomáhá chránit chuť i kvalitu produktu během skladování i po otevření. Zároveň umožňuje snadné dávkování přímo z kohoutku.',
  3000, 15, 799, 10)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, sort_order)
VALUES ((SELECT id FROM products WHERE slug = 'kosmopolitan'), 'kosmopolitan-500ml', '500 ml Praktické balení', '2–3 nápoje', 'Lehké a nerozbitné balení vhodné na cesty nebo pro menší spotřebu.',
  500, NULL, 169, 20)
ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, label = EXCLUDED.label, short_note = EXCLUDED.short_note,
  package_description = EXCLUDED.package_description, volume_ml = EXCLUDED.volume_ml, servings = EXCLUDED.servings,
  price_b2c_kc = EXCLUDED.price_b2c_kc, sort_order = EXCLUDED.sort_order, updated_at = now();

-- 4) Fotky (jen produkty, které fotku mají; bez duplicit při opakovaném spuštění)
INSERT INTO product_images (product_id, url, alt, sort_order)
SELECT id, '/eshop/svarak-deluxe.jpg', 'Svařák Deluxe', 0 FROM products WHERE slug = 'svarak-deluxe'
AND NOT EXISTS (SELECT 1 FROM product_images i JOIN products x ON x.id = i.product_id WHERE x.slug = 'svarak-deluxe' AND i.url = '/eshop/svarak-deluxe.jpg');
INSERT INTO product_images (product_id, url, alt, sort_order)
SELECT id, '/eshop/lady-carneval.jpg', 'Lady Carneval', 0 FROM products WHERE slug = 'lady-carneval'
AND NOT EXISTS (SELECT 1 FROM product_images i JOIN products x ON x.id = i.product_id WHERE x.slug = 'lady-carneval' AND i.url = '/eshop/lady-carneval.jpg');
INSERT INTO product_images (product_id, url, alt, sort_order)
SELECT id, '/eshop/granatovy-bond.jpg', 'Granátový Bond', 0 FROM products WHERE slug = 'granatovy-bond'
AND NOT EXISTS (SELECT 1 FROM product_images i JOIN products x ON x.id = i.product_id WHERE x.slug = 'granatovy-bond' AND i.url = '/eshop/granatovy-bond.jpg');
INSERT INTO product_images (product_id, url, alt, sort_order)
SELECT id, '/eshop/kosmopolitan.jpg', 'Kosmopolitan', 0 FROM products WHERE slug = 'kosmopolitan'
AND NOT EXISTS (SELECT 1 FROM product_images i JOIN products x ON x.id = i.product_id WHERE x.slug = 'kosmopolitan' AND i.url = '/eshop/kosmopolitan.jpg');

-- PRODUCTION — NÁVRAT e-shopových migrací 0019 → 0013 (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs).
-- JEN pokud se e-shop ještě nespustil: smaže katalog a e-shopová pole objednávek.
-- Selže (a nic nezmění), pokud už existuje objednávka bez organizace nebo jiná e-shopová data,
-- která by se ztratila. Před spuštěním číslování vrátit 29_numbering_rollback.sql.

BEGIN;

-- ===== 07_orders_guest_down.sql =====
-- Návrat kroku 7. Vratné JEN dokud neexistuje objednávka bez organizace:
--   SELECT count(*) FROM orders WHERE buyer_organization_id IS NULL;
ALTER TABLE orders ALTER COLUMN buyer_organization_id SET NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_guest_requires_contact;
ALTER TABLE orders DROP CONSTRAINT orders_manual_requires_org;

-- ===== 06a_order_number_column_down.sql =====
-- Návrat kroku 6a. Vratné, dokud čísla nikdo neviděl (před krokem 6b).
DROP INDEX orders_order_number_key;
ALTER TABLE orders DROP COLUMN order_number;

-- ===== 05_order_items_variant_down.sql =====
-- Návrat kroku 5. Vždy vratné; zmizí jen vazby (názvy a ceny v položkách zůstávají).
DROP INDEX order_items_product_variant_idx;
ALTER TABLE order_items DROP CONSTRAINT order_items_variant_has_sku;
ALTER TABLE order_items DROP CONSTRAINT order_items_line_total_consistent;
ALTER TABLE order_items DROP CONSTRAINT order_items_quantity_positive;
ALTER TABLE order_items DROP COLUMN sku_snapshot, DROP COLUMN product_variant_id;

-- ===== 04_orders_eshop_fields_down.sql =====
-- Návrat kroku 4. Technicky vždy vratné; smaže ale údaje uložené do nových
-- sloupců (poznámky zákazníků, způsob dopravy, souhlasy) — po spuštění
-- e-shopu jen po záloze.
ALTER TABLE orders DROP CONSTRAINT orders_total_consistent;
ALTER TABLE orders DROP CONSTRAINT orders_discount_nonnegative;
ALTER TABLE orders DROP CONSTRAINT orders_channel_check;
ALTER TABLE orders
  DROP COLUMN terms_accepted_at,
  DROP COLUMN age_confirmed_at,
  DROP COLUMN discount_kc,
  DROP COLUMN payment_method_label,
  DROP COLUMN payment_method_code,
  DROP COLUMN shipping_method_label,
  DROP COLUMN shipping_method_code,
  DROP COLUMN customer_note,
  DROP COLUMN channel;

-- ===== 03_order_activity_actor_down.sql =====
-- Návrat kroku 3. Vratné jen dokud neexistuje žádný systémový/zákaznický
-- záznam (author_user_id IS NULL) — jinak SET NOT NULL selže. Kontrola:
--   SELECT count(*) FROM order_activity WHERE author_user_id IS NULL;
ALTER TABLE order_activity DROP CONSTRAINT order_activity_user_has_author;
ALTER TABLE order_activity ALTER COLUMN author_user_id SET NOT NULL;
ALTER TABLE order_activity DROP CONSTRAINT order_activity_actor_type_check;
ALTER TABLE order_activity DROP COLUMN actor_type;

-- ===== 02_products_seed_down.sql =====
-- Návrat kroku 2: smaže jen záznamy ze seedu (podle slug/sku). Selže (FK
-- RESTRICT), pokud na balení už odkazuje order_items — to je záměr.
DELETE FROM product_variants WHERE sku IN (
  'dynova-polevka', 'kulajda', 'rajcatova-polevka',
  'svarak-deluxe-3l', 'svarak-deluxe-500ml', 'lady-carneval-3l', 'lady-carneval-500ml',
  'granatovy-bond-3l', 'granatovy-bond-500ml', 'kosmopolitan-3l', 'kosmopolitan-500ml'
);
DELETE FROM products WHERE slug IN (
  'dynova-polevka', 'kulajda', 'rajcatova-polevka',
  'svarak-deluxe', 'lady-carneval', 'granatovy-bond', 'kosmopolitan'
); -- product_images se smažou kaskádou
DELETE FROM product_categories WHERE slug IN ('polevky', 'sirupy', 'caje', 'ovocne-napoje', 'koktejly');

-- ===== 01_products_down.sql =====
-- Návrat kroku 1. Selže (FK RESTRICT), pokud už existuje krok 5 s vazbami
-- z order_items — pak nejdřív 05_order_items_down.sql.
DROP TABLE product_images;
DROP TABLE product_variants;
DROP TABLE products;
DROP TABLE product_categories;

COMMIT;

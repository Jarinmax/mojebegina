-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Kontrola po krocích 1–7 (jen čtení).
SELECT (SELECT count(*) FROM product_categories) AS categories,   -- 5
       (SELECT count(*) FROM products) AS products,               -- 7
       (SELECT count(*) FROM product_variants) AS variants,       -- 11
       (SELECT count(*) FROM product_images) AS images;           -- 4

-- Alkoholické produkty musí být 18+ (0 řádků)
SELECT slug FROM products WHERE alcohol_percent > 0.5 AND NOT is_age_restricted;

-- SKU v DB = SKU v catalog.ts (11 řádků, žádný chybějící)
SELECT sku, price_b2c_kc, volume_ml FROM product_variants ORDER BY sku;

-- Existující objednávky beze změny obsahu, jen nové sloupce
SELECT id, channel, order_number, discount_kc, total_kc FROM orders ORDER BY ordered_at;

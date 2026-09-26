-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Krok 5 (drizzle 0015): vazba položky na balení + snapshot SKU.
-- name a unit_price_kc už snapshotem jsou a zůstávají beze změny.
ALTER TABLE order_items
  ADD COLUMN product_variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT,
  ADD COLUMN sku_snapshot text;
ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);
ALTER TABLE order_items ADD CONSTRAINT order_items_line_total_consistent
  CHECK (line_total_kc = quantity * unit_price_kc);
ALTER TABLE order_items ADD CONSTRAINT order_items_variant_has_sku
  CHECK (product_variant_id IS NULL OR sku_snapshot IS NOT NULL);
CREATE INDEX order_items_product_variant_idx ON order_items (product_variant_id);

-- VOLITELNĚ (samostatně, po schválení): propojit historické položky
-- polévek s balením podle přesné shody názvu. Jen produkty s jediným
-- balením, jinak by vazba byla hádání. Nejdřív náhled:
--   SELECT i.id, i.name, v.sku FROM order_items i
--   JOIN products p ON p.name = i.name
--   JOIN product_variants v ON v.product_id = p.id
--   WHERE i.product_variant_id IS NULL
--     AND (SELECT count(*) FROM product_variants x WHERE x.product_id = p.id) = 1;
-- a pak stejný dotaz jako UPDATE ... SET product_variant_id = v.id, sku_snapshot = v.sku.

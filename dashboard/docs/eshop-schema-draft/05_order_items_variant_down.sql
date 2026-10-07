-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Návrat kroku 5. Vždy vratné; zmizí jen vazby (názvy a ceny v položkách zůstávají).
DROP INDEX order_items_product_variant_idx;
ALTER TABLE order_items DROP CONSTRAINT order_items_variant_has_sku;
ALTER TABLE order_items DROP CONSTRAINT order_items_line_total_consistent;
ALTER TABLE order_items DROP CONSTRAINT order_items_quantity_positive;
ALTER TABLE order_items DROP COLUMN sku_snapshot, DROP COLUMN product_variant_id;

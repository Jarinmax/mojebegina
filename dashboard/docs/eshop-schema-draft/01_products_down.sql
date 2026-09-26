-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Návrat kroku 1. Selže (FK RESTRICT), pokud už existuje krok 5 s vazbami
-- z order_items — pak nejdřív 05_order_items_down.sql.
DROP TABLE product_images;
DROP TABLE product_variants;
DROP TABLE products;
DROP TABLE product_categories;

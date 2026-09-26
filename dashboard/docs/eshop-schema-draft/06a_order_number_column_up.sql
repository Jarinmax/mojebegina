-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Krok 6a (drizzle 0016a): sloupec pro číslo objednávky, zatím bez řady.
-- Nic se nečísluje; nové objednávky mají NULL až do kroku 6b.
ALTER TABLE orders ADD COLUMN order_number bigint;
CREATE UNIQUE INDEX orders_order_number_key ON orders (order_number);

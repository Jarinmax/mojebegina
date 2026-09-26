-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Návrat kroku 6a. Vratné, dokud čísla nikdo neviděl (před krokem 6b).
DROP INDEX orders_order_number_key;
ALTER TABLE orders DROP COLUMN order_number;

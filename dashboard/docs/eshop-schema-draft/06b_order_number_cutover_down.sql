-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Návrat kroku 6b. Technicky vratné, ale jakmile zákazník dostal číslo
-- (e-mail, faktura), je to OBCHODNĚ NEVRATNÉ — čísla se nesmí znovu použít.
ALTER TABLE orders DROP CONSTRAINT orders_number_required;
ALTER TABLE orders ALTER COLUMN order_number DROP DEFAULT;
DROP SEQUENCE order_number_seq; -- order_number hodnoty zůstávají

-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Návrat kroku 7. Vratné JEN dokud neexistuje objednávka bez organizace:
--   SELECT count(*) FROM orders WHERE buyer_organization_id IS NULL;
ALTER TABLE orders ALTER COLUMN buyer_organization_id SET NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_guest_requires_contact;
ALTER TABLE orders DROP CONSTRAINT orders_manual_requires_org;

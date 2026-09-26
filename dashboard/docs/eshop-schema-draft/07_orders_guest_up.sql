-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Krok 7 (drizzle 0017): objednávka bez organizace (B2C / guest checkout).
-- SPUSTIT AŽ PO NASAZENÍ KÓDU moje.begina.cz, který umí objednávku bez
-- organizace zobrazit (viz ESHOP_SCHEMA_PROPOSAL.md, konflikty).
ALTER TABLE orders ADD CONSTRAINT orders_manual_requires_org
  CHECK (channel <> 'manual' OR buyer_organization_id IS NOT NULL);
ALTER TABLE orders ADD CONSTRAINT orders_guest_requires_contact
  CHECK (buyer_organization_id IS NOT NULL OR contact_email IS NOT NULL);
ALTER TABLE orders ALTER COLUMN buyer_organization_id DROP NOT NULL;

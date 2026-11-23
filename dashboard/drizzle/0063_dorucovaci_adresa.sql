-- Doručovací adresa zákazníka (Lucie 23. 11. 2026): kam se vozí, když se liší
-- od sídla (sídlo zůstává na faktuře). Nové objednávky ji převezmou.
-- Jen přidává nullable sloupec; na produkci spustit ručně v Neon SQL Editoru.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "delivery_address" text;

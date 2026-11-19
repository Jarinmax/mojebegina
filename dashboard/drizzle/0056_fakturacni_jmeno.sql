-- Fakturační jméno zákazníka (Jarin 19. 11. 2026): karta zákazníka se jmenuje
-- podle člověka, se kterým obchodujeme (např. „Marek Baroš“), faktura jde na
-- jméno majitele IČO (např. „Lenka Kermes“). Jen přidává nullable sloupec;
-- na produkci spustit ručně v Neon SQL Editoru (větev production).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_name" text;

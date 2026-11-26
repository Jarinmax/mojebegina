-- Stálý zákazník: nezaplacené objednávky (hotově / na fakturu) smí do Výroby (Lucie 26. 11. 2026)
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pay_later_allowed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "organizations" SET "pay_later_allowed" = true WHERE "id" IN ('c4783648-02cc-4eda-8d72-dc9a647eb9b9', '3b09015e-0771-49d8-8e24-6dd4d68da62e');

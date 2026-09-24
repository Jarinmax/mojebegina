-- Security Phase 15 (Objednávky 1.0), krok 2/2 — po backfillu v 0007
-- (payment_status naplněný pro všechny řádky) starý `status` sloupec
-- definitivně mizí. Redundantní ALTER ... SET NOT NULL (0007 to už udělala)
-- je tu jen proto, že ho takhle vygeneroval drizzle-kit diff proti
-- předchozímu snapshotu — neškodí, no-op na sloupci, který už NOT NULL je.
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "status";
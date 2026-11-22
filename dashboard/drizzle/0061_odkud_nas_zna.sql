-- „Odkud nás zná“ u leadů + vlastní Google kalendář pro každého obchodníka
-- (Lucie 20. 11. 2026). V produkci už spuštěno ručně 21./22. 11.; IF NOT EXISTS
-- = lze spustit opakovaně, nic nemaže.
ALTER TABLE "lead_calendar_sync" ADD COLUMN IF NOT EXISTS "synced_user_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "heard_from" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "heard_from_detail" text;

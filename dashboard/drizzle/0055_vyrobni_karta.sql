-- Výrobní karta (Lucie 18. 11. 2026): zaškrtnutí vyrobené položky.
-- Jen přidává nullable sloupce; na produkci spustil Jarin ručně 18. 11. 2026.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "produced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "produced_by_name" text;

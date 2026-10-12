-- "Znovu přečíst doklad" — opakované AI vytěžení draft příjemky, co už
-- může mít goods_receipt_lines (z ruční práce i z dřívějšího úspěšného
-- vytěžení). Zcela ODDĚLENO od extraction_status/extraction_raw výš v
-- téže tabulce, aby probíhající/neúspěšné nové čtení NIKDY nemohlo
-- poškodit nebo jen signalizovat změnu u už existujících řádků — nový
-- výsledek čeká v reextraction_raw ve stavu 'ready' k porovnání, teprve
-- explicitní převzetí (acceptGoodsReceiptReextraction, lib/data/sklad.ts)
-- přepíše goods_receipt_lines. reextraction_claimed_at (ne updated_at)
-- nese vlastní, nezávislou staleness kontrolu pro atomický claim
-- (stejný vzor jako extraction_status/updated_at u původního vytěžení).
--
-- PŘIPRAVENO, NENASAZENO — tato migrace se dosud NEspustila proti žádné
-- databázi (ani Preview, ani Production).
ALTER TABLE "goods_receipts" ADD COLUMN "reextraction_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN "reextraction_raw" jsonb;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN "reextraction_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_reextraction_status_check" CHECK ("goods_receipts"."reextraction_status" IN ('none','pending','ready','failed'));

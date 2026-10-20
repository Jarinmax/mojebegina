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
--> statement-breakpoint

-- ===== Ruční doplněk (kontrola před nasazením): goods_receipt_lines.updated_at
-- musí být DATABÁZOVĚ vynucené, ne jen aplikační konvence =====
--
-- Reálný nález (empiricky, ne jen staticky — viz skladReextractionPglite.test.ts):
-- acceptGoodsReceiptReextraction (sklad.ts) chrání ruční úpravy provedené
-- BĚHEM nového čtení porovnáním (count, max(updated_at)) snímku z doby
-- spuštění čtení s aktuálním stavem goods_receipt_lines. Tahle ochrana
-- je ale SPRÁVNÁ jen tak dlouho, dokud KAŽDÝ zápis do goods_receipt_lines
-- updated_at skutečně nastaví na "teď" — žádný DB sloupec to dřív
-- nevynucoval, spoléhalo se čistě na to, že si to každá volající funkce
-- (updateGoodsReceiptLine, reviewGoodsReceiptLineVat,
-- confirmGoodsReceiptLineMapping, …) sama pohlídá. Ověřeno reálným
-- pokusem nad PGlite: prostý `UPDATE goods_receipt_lines SET
-- raw_description = … WHERE id = …` BEZ explicitního `updated_at = now()`
-- ponechá updated_at beze změny — řádek, co NENÍ zrovna ten s nejnovějším
-- updated_at, by se tak dal ručně upravit a ochrana by si toho vůbec
-- nevšimla (count i max(updated_at) by zůstaly stejné). Stejný princip
-- jako goods_receipt_lines_reset_vat_confirmed níž (a goods_receipt_lines
-- samotný trigger z migrace 0023) — appková konvence bez DB vynucení je
-- křehká vůči budoucí (nebo přehlédnuté existující) zápisové cestě, co na
-- ni zapomene; řešení je trigger, co updated_at nastaví VŽDY, bez ohledu
-- na to, co volající kód nastavil nebo opomněl nastavit. Aplikační
-- `updatedAt: new Date()` na stávajících zápisech (sklad.ts,
-- skladExtraction.ts) zůstává beze změny — je teď neškodně nadbytečné,
-- ne nesprávné, a trigger funguje i pro případnou budoucí zápisovou
-- cestu, co by na něj zapomněla.
CREATE FUNCTION goods_receipt_lines_bump_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER goods_receipt_lines_bump_updated_at
  BEFORE UPDATE ON goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION goods_receipt_lines_bump_updated_at();

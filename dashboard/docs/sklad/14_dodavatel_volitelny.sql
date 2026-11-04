-- SKLAD 1.0 — migrace 0025: dodavatel u příjemky je VOLITELNÝ (drizzle
-- 0025_sklad_1_0_dodavatel_volitelny.sql). Příjemka se smí založit i bez
-- dodavatele — appka ho pak dohledá nebo založí sama podle AI vytěžení
-- fotky dokladu (resolveSupplierId, lib/data/skladExtraction.ts); draft bez
-- dodavatele jde založit a vyfotit, ale ne potvrdit (blocker "no_supplier").
-- Jediná změna: zrušení NOT NULL na goods_receipts.supplier_id. Nic se
-- nemaže, nic neukládá — existující příjemky (mají dodavatele vždy) se
-- nezmění. Spouštět CELOU najednou (jedna transakce), JEN po výslovném
-- schválení. Pojistka: jen na větvi, kde sklad už existuje a migrace ještě
-- neproběhla (podruhé STOP, nic se nezmění).
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'goods_receipts') THEN
    RAISE EXCEPTION 'STOP: sklad ještě neexistuje — nejdřív 11_migration.sql (nebo 11_migration_PREVIEW.sql). Nic se nezměnilo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'goods_receipts' AND column_name = 'supplier_id' AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'STOP: goods_receipts.supplier_id už je volitelný (migrace už proběhla?). Nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'OK: sklad existuje, supplier_id je NOT NULL — pokračuji migrací 0025.';
END
$guard$;

-- ===== 0025_sklad_1_0_dodavatel_volitelny.sql =====
ALTER TABLE "goods_receipts" ALTER COLUMN "supplier_id" DROP NOT NULL;

COMMIT;

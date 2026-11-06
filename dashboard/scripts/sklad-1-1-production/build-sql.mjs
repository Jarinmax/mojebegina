// SKLAD 1.1 (hotové výrobky) — sestaví SQL pro Production (a Preview) z
// HOTOVÉ migrace 0030 v repozitáři, stejný princip jako
// scripts/sklad-production/build-sql.mjs pro 0028+0029 (ten zůstává
// nedotčený — oddělený rozsah, žádný paralelní systém):
//   docs/sklad/21_migration.sql         = drizzle 0030 S POJISTKOU (jen Production main)
//   docs/sklad/21_migration_PREVIEW.sql = totéž, ale pojistka naopak ODMÍTNE Production
// Kontroly 20_before.sql / 22_after.sql a vrácení 29_rollback.sql jsou psané
// ručně (nic negenerují). Spuštění: node scripts/sklad-1-1-production/build-sql.mjs
// Test lib/data/__tests__/skladFinishedGoodsProductionSql.test.ts hlídá, že
// soubory odpovídají a že celý postup projde nad kopií schématu Production (PGlite).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

export const SKLAD_1_1_TAG = "0030_sklad_1_1_hotove_vyrobky";

// Production větev `main` v Neonu (stejná hodnota jako scripts/sklad-production/build-sql.mjs).
export const PRODUCTION_MAIN_TIMELINE_ID = "70a96b3677653646e65343cae8e27182";

function migrationBody() {
  const body = read(`drizzle/${SKLAD_1_1_TAG}.sql`).replaceAll("--> statement-breakpoint", "").trim();
  return `-- ===== ${SKLAD_1_1_TAG}.sql =====\n${body.endsWith(";") ? body : `${body};`}\n`;
}

// Stav před migrací: Sklad 1.0 (0028+0029) hotový — ověřeno přes
// goods_receipts.reextraction_status (0029) — a Sklad 1.1 ještě neexistuje.
const PRESTATE_CHECKS = `  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'goods_receipts' AND column_name = 'reextraction_status') THEN
    RAISE EXCEPTION 'STOP: chybí Sklad 1.0 migrace 0028+0029 (goods_receipts.reextraction_status). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('stock_batches', 'stock_reservations')) THEN
    RAISE EXCEPTION 'STOP: Sklad 1.1 (hotové výrobky) už existuje (migrace už běžela?). Nic se nezměnilo.';
  END IF;`;

function guard(branchCheck, okMessage) {
  return `DO $guard$
DECLARE
  timeline text := current_setting('neon.timeline_id', true);
BEGIN
${branchCheck}
${PRESTATE_CHECKS}
  RAISE NOTICE '${okMessage}';
END
$guard$;`;
}

export function productionMigrationSql(timelineId = PRODUCTION_MAIN_TIMELINE_ID) {
  const branchCheck = `  IF timeline IS DISTINCT FROM '${timelineId}' THEN
    RAISE EXCEPTION 'STOP: tohle NENÍ Production větev main (neon.timeline_id = %). Nic se nezměnilo.', coalesce(timeline, 'neznámý');
  END IF;`;
  return (
    `-- PRODUCTION main — Sklad 1.1 (hotové výrobky), migrace 0030 S POJISTKOU (VYGENEROVÁNO scripts/sklad-1-1-production/build-sql.mjs).\n` +
    `-- Obsah = přesně drizzle/${SKLAD_1_1_TAG}.sql.\n` +
    `-- Jako PRVNÍ krok transakce kontrola: větev main (neon.timeline_id ${timelineId}), Sklad 1.0 (0028+0029)\n` +
    `-- hotový a Sklad 1.1 ještě neexistuje. Na jiné větvi nebo podruhé se transakce zastaví a NIC se nezmění.\n` +
    `-- Jen přidává (2 tabulky stock_batches/stock_reservations, pohled stock_item_availability,\n` +
    `-- 4 nové sloupce na stock_movements) — stávající data (dodavatelé, karty, příjemky, pohyby) se nemění.\n` +
    `-- Před: 20_before.sql · po: 22_after.sql · vrácení: 29_rollback.sql.\n` +
    `-- Spouštět CELÉ najednou v Neon SQL Editoru (jedna transakce), JEN po výslovném schválení.\n\n` +
    `BEGIN;\n\n-- ===== POJISTKA: jen Production main, jen jednou, jen po Skladu 1.0 =====\n` +
    `${guard(branchCheck, "OK: Production main, Sklad 1.0 hotový, Sklad 1.1 ještě ne — pokračuji migrací 0030.")}\n\n` +
    `${migrationBody()}\nCOMMIT;\n`
  );
}

export function previewMigrationSql(productionTimelineId = PRODUCTION_MAIN_TIMELINE_ID) {
  const branchCheck = `  IF timeline = '${productionTimelineId}' THEN
    RAISE EXCEPTION 'STOP: tohle je Production větev main — pro Production slouží 21_migration.sql. Nic se nezměnilo.';
  END IF;`;
  return (
    `-- PREVIEW — Sklad 1.1 (hotové výrobky), migrace 0030 (VYGENEROVÁNO scripts/sklad-1-1-production/build-sql.mjs).\n` +
    `-- Stejný obsah jako 21_migration.sql, ale pojistka naopak ODMÍTNE Production větev main.\n` +
    `-- Spouštět CELÉ najednou v Neon SQL Editoru na Preview větvi (jedna transakce).\n\n` +
    `BEGIN;\n\n-- ===== POJISTKA: nikdy Production, jen jednou, jen po Skladu 1.0 =====\n` +
    `${guard(branchCheck, "OK: ne-produkční větev, Sklad 1.0 hotový, Sklad 1.1 ještě ne — pokračuji migrací 0030.")}\n\n` +
    `${migrationBody()}\nCOMMIT;\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, "docs/sklad/21_migration.sql"), productionMigrationSql());
  writeFileSync(join(ROOT, "docs/sklad/21_migration_PREVIEW.sql"), previewMigrationSql());
  console.log("docs/sklad/21_migration.sql + 21_migration_PREVIEW.sql vygenerovány.");
}

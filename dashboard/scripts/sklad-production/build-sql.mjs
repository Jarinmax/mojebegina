// SKLAD 1.0 — sestaví SQL pro Production (a Preview) z HOTOVÝCH migrací
// v repozitáři, aby se nic nepřepisovalo ručně:
//   docs/sklad/11_migration.sql         = drizzle 0023 + 0024 S POJISTKOU (jen Production main)
//   docs/sklad/11_migration_PREVIEW.sql = totéž, ale pojistka naopak ODMÍTNE Production
// Kontroly 10_before.sql / 12_after.sql a vrácení 19_rollback.sql jsou psané
// ručně (nic negenerují). Spuštění: node scripts/sklad-production/build-sql.mjs
// Test lib/data/__tests__/skladProductionSql.test.ts hlídá, že soubory
// odpovídají a že celý postup projde nad kopií schématu Production (PGlite).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

export const SKLAD_TAGS = ["0023_sklad_1_0_zaklad", "0024_sklad_1_0_znovu_precist"];

// Production větev `main` v Neonu (stejná hodnota jako scripts/eshop-production/build-sql.mjs).
export const PRODUCTION_MAIN_TIMELINE_ID = "70a96b3677653646e65343cae8e27182";

function migrationBody() {
  return SKLAD_TAGS.map((tag) => {
    const body = read(`drizzle/${tag}.sql`).replaceAll("--> statement-breakpoint", "").trim();
    return `-- ===== ${tag}.sql =====\n${body.endsWith(";") ? body : `${body};`}\n`;
  }).join("\n");
}

// Stav před migrací: e-shop až po 0022 (organizations.dic), katalog
// (product_variants — FK skladové karty) a žádná skladová tabulka.
const PRESTATE_CHECKS = `  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'dic')
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_variants') THEN
    RAISE EXCEPTION 'STOP: chybí e-shopové migrace do 0022 (organizations.dic, product_variants). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public'
               AND table_name IN ('suppliers', 'supplier_item_mappings', 'stock_locations', 'stock_items', 'goods_receipts',
                                  'goods_receipt_documents', 'goods_receipt_document_pages', 'goods_receipt_lines',
                                  'goods_receipt_activity', 'stock_movements', 'stock_item_balances')) THEN
    RAISE EXCEPTION 'STOP: skladové tabulky už existují (migrace už běžela?). Nic se nezměnilo.';
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
    `-- PRODUCTION main — Sklad 1.0, migrace 0023 + 0024 S POJISTKOU (VYGENEROVÁNO scripts/sklad-production/build-sql.mjs).\n` +
    `-- Obsah = přesně drizzle/0023_sklad_1_0_zaklad.sql a drizzle/0024_sklad_1_0_znovu_precist.sql.\n` +
    `-- Jako PRVNÍ krok transakce kontrola: větev main (neon.timeline_id ${timelineId}), e-shop do 0022\n` +
    `-- a žádná skladová tabulka. Na jiné větvi nebo podruhé se transakce zastaví a NIC se nezmění.\n` +
    `-- Jen přidává (10 tabulek, pohled, 4 triggery, výchozí sklad) — stávající data se nemění.\n` +
    `-- Před: 10_before.sql · po: 12_after.sql · vrácení: 19_rollback.sql.\n` +
    `-- Spouštět CELÉ najednou v Neon SQL Editoru (jedna transakce), JEN po výslovném schválení.\n\n` +
    `BEGIN;\n\n-- ===== POJISTKA: jen Production main, jen jednou =====\n` +
    `${guard(branchCheck, "OK: Production main, stav před skladem — pokračuji migracemi 0023–0024.")}\n\n` +
    `${migrationBody()}\nCOMMIT;\n`
  );
}

export function previewMigrationSql(productionTimelineId = PRODUCTION_MAIN_TIMELINE_ID) {
  const branchCheck = `  IF timeline = '${productionTimelineId}' THEN
    RAISE EXCEPTION 'STOP: tohle je Production větev main — pro Production slouží 11_migration.sql. Nic se nezměnilo.';
  END IF;`;
  return (
    `-- PREVIEW — Sklad 1.0, migrace 0023 + 0024 (VYGENEROVÁNO scripts/sklad-production/build-sql.mjs).\n` +
    `-- Stejný obsah jako 11_migration.sql, ale pojistka naopak ODMÍTNE Production větev main.\n` +
    `-- Spouštět CELÉ najednou v Neon SQL Editoru na Preview větvi (jedna transakce).\n\n` +
    `BEGIN;\n\n-- ===== POJISTKA: nikdy Production, jen jednou =====\n` +
    `${guard(branchCheck, "OK: ne-produkční větev, stav před skladem — pokračuji migracemi 0023–0024.")}\n\n` +
    `${migrationBody()}\nCOMMIT;\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, "docs/sklad/11_migration.sql"), productionMigrationSql());
  writeFileSync(join(ROOT, "docs/sklad/11_migration_PREVIEW.sql"), previewMigrationSql());
  console.log("docs/sklad/11_migration.sql + 11_migration_PREVIEW.sql vygenerovány.");
}

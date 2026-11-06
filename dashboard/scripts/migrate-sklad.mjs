// Sklad 1.0 — hlídané migrace 0030 (10 skladových tabulek, pohled zůstatků,
// triggery, výchozí sklad) a 0031 („Znovu přečíst doklad“ + trigger
// updated_at řádků) při buildu na Vercelu. Stejný princip jako
// migrate-work-tasks.mjs:
//   • Production: žádná skladová tabulka → 0030 + 0031 v JEDNÉ transakci;
//     všechny tabulky už jsou → nic (případně jen chybějící 0031);
//     jen část tabulek → STOP (částečné schéma, nic se nezmění, build skončí
//     a dál běží dosavadní verze).
//   • Preview: totéž, ale JEN na Neon větvi Preview — pokud by DATABASE_URL
//     ukazovala na produkční databázi (timeline produkce), skript nic nezmění.
//   • Jinde (lokálně, testy): nic.
// Migrace jen přidávají; stávající data (CRM, objednávky, e-shop, úkoly) se
// nemění. Ruční alternativa a vrácení: docs/sklad/11_migration.sql, 19_rollback.sql.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

export const SKLAD_TABLES = [
  "goods_receipt_activity",
  "goods_receipt_document_pages",
  "goods_receipt_documents",
  "goods_receipt_lines",
  "goods_receipts",
  "stock_items",
  "stock_locations",
  "stock_movements",
  "supplier_item_mappings",
  "suppliers",
];
const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026

export const statementsOf = (text) =>
  text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

const read = (rel) => readFile(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// Exportováno pro scripts/__tests__/migrateSklad.test.ts (spustí tenhle
// přesný kód nad PGlite se všemi třemi větvemi — od nuly, už hotovo,
// částečné schéma) — žádná jiná cesta neumí main() zavolat víckrát nad
// stejnou databází bez spouštění coby samostatný proces pokaždé znovu.
export async function runSkladMigration() {
  const env = process.env.VERCEL_ENV;
  if (env !== "production" && env !== "preview") {
    console.log("Sklad migration: skipped outside Vercel Production/Preview.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Sklad migration: DATABASE_URL is missing.");
  }

  const sql = neon(process.env.DATABASE_URL);
  const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
  if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
    console.log("Sklad migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    return;
  }

  const existing = await sql.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[]) order by table_name`,
    [SKLAD_TABLES],
  );
  const zaklad = statementsOf(await read("../drizzle/0030_sklad_1_0_zaklad.sql"));
  const znovuPrecist = statementsOf(await read("../drizzle/0031_sklad_1_0_znovu_precist.sql"));

  if (existing.length === 0) {
    await sql.transaction((tx) => [...zaklad, ...znovuPrecist].map((s) => tx.query(s)));
    console.log(`Sklad migration (${env}): schema 0030 + 0031 applied.`);
    return;
  }
  if (existing.length !== SKLAD_TABLES.length) {
    throw new Error(`Sklad migration: partial schema detected (${existing.map((r) => r.table_name).join(", ")}); stopping safely.`);
  }

  // 0031 hotovo = existuje sloupec goods_receipts.reextraction_status.
  const [{ has0031 }] = await sql.query(
    `select count(*)::int > 0 as has0031 from information_schema.columns
      where table_schema = 'public' and table_name = 'goods_receipts' and column_name = 'reextraction_status'`,
  );
  if (has0031) {
    console.log(`Sklad migration (${env}): 0030 + 0031 already applied.`);
  } else {
    await sql.transaction((tx) => znovuPrecist.map((s) => tx.query(s)));
    console.log(`Sklad migration (${env}): schema 0031 applied.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runSkladMigration();
}

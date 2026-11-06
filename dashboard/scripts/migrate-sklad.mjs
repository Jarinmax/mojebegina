// Sklad 1.0 + 1.1 — hlídané migrace 0028 (10 skladových tabulek, pohled
// zůstatků, triggery, výchozí sklad), 0029 („Znovu přečíst doklad“ +
// trigger updated_at řádků) a 0030 (hotové výrobky: šarže, rezervace,
// kind/batch/note/responsible na pohybech, pohled dostupnosti) při buildu
// na Vercelu. Stejný princip jako migrate-work-tasks.mjs, teď třístupňový:
//   • Production/Preview, nic ze skladu neexistuje → 0028 + 0029 + 0030
//     v JEDNÉ transakci;
//   • 0028 hotovo, 0029 i 0030 chybí → 0029 + 0030 v jedné transakci;
//   • 0028 + 0029 hotovo, 0030 chybí → jen 0030;
//   • všechno hotovo → nic;
//   • kdykoli částečné schéma (ne všechny tabulky dané fáze) → STOP, nic
//     se nezmění, build skončí a dál běží dosavadní verze.
//   • Preview, co by DATABASE_URL ukazovala na produkční databázi (timeline
//     produkce) → nic.
//   • Jinde (lokálně, testy): nic.
// Migrace jen přidávají; stávající data (CRM, objednávky, e-shop, úkoly,
// existující skladové pohyby) se nemění — 0030 zpětně jen DOPLNÍ "kind" u
// starých pohybů (goods_receipt_in / void_reversal), nikdy nepřepíše nic
// jiného. Ruční alternativa a vrácení: docs/sklad/11_migration.sql,
// 19_rollback.sql (0028+0029) a docs/sklad/21_migration.sql (0030).
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
// Sklad 1.1 — jen DVĚ nové tabulky (stock_batches, stock_reservations);
// zbytek 0030 jsou ALTER TABLE na existujících tabulkách ze SKLAD_TABLES.
export const SKLAD_1_1_TABLES = ["stock_batches", "stock_reservations"];
const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026

export const statementsOf = (text) =>
  text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

const read = (rel) => readFile(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

async function tablesPresent(sql, tableNames) {
  const rows = await sql.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[]) order by table_name`,
    [tableNames],
  );
  return rows.map((r) => r.table_name);
}

// Exportováno pro scripts/__tests__/migrateSklad.test.ts (spustí tenhle
// přesný kód nad PGlite v několika stavech — od nuly, po jednotlivých
// fázích, částečné schéma) — žádná jiná cesta neumí tuhle funkci zavolat
// víckrát nad stejnou databází bez spouštění coby samostatný proces
// pokaždé znovu.
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

  const zaklad = statementsOf(await read("../drizzle/0028_sklad_1_0_zaklad.sql"));
  const znovuPrecist = statementsOf(await read("../drizzle/0029_sklad_1_0_znovu_precist.sql"));
  const hotoveVyrobky = statementsOf(await read("../drizzle/0030_sklad_1_1_hotove_vyrobky.sql"));

  const existing = await tablesPresent(sql, SKLAD_TABLES);

  if (existing.length === 0) {
    await sql.transaction((tx) => [...zaklad, ...znovuPrecist, ...hotoveVyrobky].map((s) => tx.query(s)));
    console.log(`Sklad migration (${env}): schema 0028 + 0029 + 0030 applied.`);
    return;
  }
  if (existing.length !== SKLAD_TABLES.length) {
    throw new Error(`Sklad migration: partial schema detected (${existing.join(", ")}); stopping safely.`);
  }

  // 0029 hotovo = existuje sloupec goods_receipts.reextraction_status.
  const [{ has0029 }] = await sql.query(
    `select count(*)::int > 0 as has0029 from information_schema.columns
      where table_schema = 'public' and table_name = 'goods_receipts' and column_name = 'reextraction_status'`,
  );
  if (!has0029) {
    await sql.transaction((tx) => [...znovuPrecist, ...hotoveVyrobky].map((s) => tx.query(s)));
    console.log(`Sklad migration (${env}): schema 0029 + 0030 applied.`);
    return;
  }

  const existing1_1 = await tablesPresent(sql, SKLAD_1_1_TABLES);
  if (existing1_1.length === 0) {
    await sql.transaction((tx) => hotoveVyrobky.map((s) => tx.query(s)));
    console.log(`Sklad migration (${env}): schema 0030 applied.`);
    return;
  }
  if (existing1_1.length !== SKLAD_1_1_TABLES.length) {
    throw new Error(`Sklad migration: partial schema detected for 0030 (${existing1_1.join(", ")}); stopping safely.`);
  }
  console.log(`Sklad migration (${env}): 0028 + 0029 + 0030 already applied.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runSkladMigration();
}

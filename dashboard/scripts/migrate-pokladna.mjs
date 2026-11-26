// Pokladna bistra — hlídaná migrace 0068 (pos_items, pos_receipts,
// pos_receipt_lines, pos_day_closes) při buildu na Vercelu, stejný princip jako ostatní
// scripts/migrate-*.mjs. Jen SCHÉMA: menu a ceny zadává vedení po nasazení
// přímo v MojeBegina (Pokladna → Menu).
//   • tabulky už jsou → nic; jen jedna → STOP (částečné schéma),
//   • Preview: jen na Neon větvi Preview (DATABASE_URL na produkční timeline →
//     nic se nezmění). Jinde (lokálně, testy) nic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026
export const POS_TABLES = ["pos_items", "pos_receipts", "pos_receipt_lines", "pos_day_closes"];
export const statementsOf = (text) =>
  text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

export async function runPosMigration() {
  const env = process.env.VERCEL_ENV;
  if (env !== "production" && env !== "preview") {
    console.log("POS migration: skipped outside Vercel Production/Preview.");
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("POS migration: DATABASE_URL is missing.");

  const sql = neon(process.env.DATABASE_URL);
  const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
  if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
    console.log("POS migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    return;
  }

  const existing = await sql.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
    [POS_TABLES],
  );
  if (existing.length === 0) {
    const statements = statementsOf(await readFile(fileURLToPath(new URL("../drizzle/0068_pokladna.sql", import.meta.url)), "utf8"));
    await sql.transaction((tx) => statements.map((s) => tx.query(s)));
    console.log(`POS migration (${env}): schema 0068 applied.`);
  } else if (existing.length !== POS_TABLES.length) {
    throw new Error(`POS migration: partial schema detected (${existing.map((r) => r.table_name).join(", ")}); stopping safely.`);
  } else {
    console.log(`POS migration (${env}): 0068 already applied.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runPosMigration();
}

// Svěřené peníze spolupracovníka — hlídaná migrace 0060 (trust_entries,
// trust_recurring) při buildu na Vercelu, stejný princip jako ostatní
// scripts/migrate-*.mjs. Jen SCHÉMA: konkrétní částky jsou soukromé a do kódu
// nepatří — zapisuje je vedení po nasazení přímo v MojeBegina.
//   • tabulky už jsou → nic; jen jedna → STOP (částečné schéma),
//   • Preview: jen na Neon větvi Preview (DATABASE_URL na produkční timeline →
//     nic se nezmění). Jinde (lokálně, testy) nic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026
export const TRUST_TABLES = ["trust_entries", "trust_recurring"];
export const statementsOf = (text) =>
  text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

export async function runTrustMigration() {
  const env = process.env.VERCEL_ENV;
  if (env !== "production" && env !== "preview") {
    console.log("Trust migration: skipped outside Vercel Production/Preview.");
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("Trust migration: DATABASE_URL is missing.");

  const sql = neon(process.env.DATABASE_URL);
  const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
  if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
    console.log("Trust migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    return;
  }

  const existing = await sql.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
    [TRUST_TABLES],
  );
  if (existing.length === 0) {
    const statements = statementsOf(await readFile(fileURLToPath(new URL("../drizzle/0060_sverene_penize.sql", import.meta.url)), "utf8"));
    await sql.transaction((tx) => statements.map((s) => tx.query(s)));
    console.log(`Trust migration (${env}): schema 0060 applied.`);
  } else if (existing.length !== TRUST_TABLES.length) {
    throw new Error(`Trust migration: partial schema detected (${existing.map((r) => r.table_name).join(", ")}); stopping safely.`);
  } else {
    console.log(`Trust migration (${env}): 0060 already applied.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runTrustMigration();
}

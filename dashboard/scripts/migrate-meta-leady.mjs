// Leady z Mety (16. 11. 2026) — hlídaná migrace 0045 (meta_lead_imports) při
// buildu na Vercelu, stejný princip jako ostatní scripts/migrate-*.mjs:
//   • tabulka už je → nic; jinak se v jedné transakci založí,
//   • Preview: jen na Neon větvi Preview (DATABASE_URL na produkční timeline →
//     nic se nezmění). Jinde (lokálně, testy) nic.
// Při chybě se transakce vrátí, build skončí a dál běží dosavadní verze.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026

export const statementsOf = (text) =>
  text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

export async function runMetaLeadsMigration() {
  const env = process.env.VERCEL_ENV;
  if (env !== "production" && env !== "preview") {
    console.log("Meta leads migration: skipped outside Vercel Production/Preview.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Meta leads migration: DATABASE_URL is missing.");
  }

  const sql = neon(process.env.DATABASE_URL);
  const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
  if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
    console.log("Meta leads migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    return;
  }

  const [{ present }] = await sql.query(`SELECT to_regclass('public.meta_lead_imports') IS NOT NULL AS present`);
  if (present) {
    console.log(`Meta leads migration (${env}): 0045 already applied.`);
    return;
  }
  const text = await readFile(fileURLToPath(new URL("../drizzle/0045_meta_leady_import.sql", import.meta.url)), "utf8");
  const statements = statementsOf(text);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Meta leads migration (${env}): schema 0045 applied (meta_lead_imports).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runMetaLeadsMigration();
}

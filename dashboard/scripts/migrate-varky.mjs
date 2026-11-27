// Várky – rozpracované vaření (migrace 0071, Jarin 27. 11. 2026).
//   • Preview (kopie databáze) → tabulka chybí → vytvoří ji; jinak nic.
//   • Preview, kdyby DATABASE_URL ukazovala na produkční databázi → nic.
//   • Production → NIC NEMĚNÍ, jen ověří, že tabulka existuje. SQL na
//     produkci spouští Jarin ručně v Neon SQL Editoru (soubor 0071);
//     dokud neproběhne, build se zastaví, aby web nespadl na chybějících
//     sloupcích.
//   • Jinde (lokálně, testy) → nic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
const env = process.env.VERCEL_ENV;

if (env !== "production" && env !== "preview") {
  console.log("Production runs migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Production runs migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
const [{ present }] = await sql.query(`SELECT to_regclass('public.production_runs') IS NOT NULL AS present`);

if (present) {
  console.log(`Production runs migration (${env}): 0071 already applied.`);
} else if (env === "production" || timeline === PRODUCTION_TIMELINE) {
  if (env === "preview") {
    console.log("Production runs migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    process.exit(0);
  }
  throw new Error(
    "Production runs migration: na produkci chybí tabulka production_runs (várky). " +
      "Spusťte docs/eshop-production/172_varky_MAIN.sql v Neon SQL Editoru (main) a build zopakujte.",
  );
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0071_varky.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Production runs migration (${env}): schema 0071 applied.`);
}

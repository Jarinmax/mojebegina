// Fakturační jméno zákazníka (migrace 0056, Jarin 19. 11. 2026).
//   • Preview (kopie databáze) → sloupec chybí → přidá ho; jinak nic.
//   • Preview, kdyby DATABASE_URL ukazovala na produkční databázi → nic.
//   • Production → NIC NEMĚNÍ, jen ověří, že sloupec existuje. SQL na
//     produkci spouští Jarin ručně v Neon SQL Editoru (soubor 0056);
//     dokud neproběhne, build se zastaví, aby web nespadl na chybějících
//     sloupcích.
//   • Jinde (lokálně, testy) → nic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
const COLUMNS = [
  "billing_name",
];
const env = process.env.VERCEL_ENV;

if (env !== "production" && env !== "preview") {
  console.log("Organization billing name migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Organization billing name migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
const [{ count }] = await sql.query(
  `select count(*)::int as count from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = any($1)`,
  [COLUMNS],
);

if (count === COLUMNS.length) {
  console.log(`Organization billing name migration (${env}): 0056 already applied.`);
} else if (env === "production" || timeline === PRODUCTION_TIMELINE) {
  if (env === "preview") {
    console.log("Organization billing name migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    process.exit(0);
  }
  throw new Error(
    "Organization billing name migration: na produkci chybí sloupec fakturačního jména (organizations.billing_name). " +
      "Spusťte drizzle/0056_fakturacni_jmeno.sql v Neon SQL Editoru (větev production) a build zopakujte.",
  );
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0056_fakturacni_jmeno.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Organization billing name migration (${env}): schema 0056 applied.`);
}

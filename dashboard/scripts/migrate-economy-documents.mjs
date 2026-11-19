// Doklady — tabulka economy_documents (migrace 0057, Lucie 19. 11. 2026).
//   • Preview (kopie databáze) → tabulka chybí → založí ji; jinak nic.
//   • Preview, kdyby DATABASE_URL ukazovala na produkční databázi → nic.
//   • Production → NIC NEMĚNÍ, jen ověří, že tabulka existuje. SQL na
//     produkci spouští Jarin ručně v Neon SQL Editoru (soubor 0057);
//     dokud neproběhne, build se zastaví, aby web nespadl.
//   • Jinde (lokálně, testy) → nic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
const env = process.env.VERCEL_ENV;

if (env !== "production" && env !== "preview") {
  console.log("Economy documents migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Economy documents migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
const [{ present }] = await sql.query(`select to_regclass('public.economy_documents') is not null as present`);

if (present) {
  console.log(`Economy documents migration (${env}): 0057 already applied.`);
} else if (env === "production" || timeline === PRODUCTION_TIMELINE) {
  if (env === "preview") {
    console.log("Economy documents migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    process.exit(0);
  }
  throw new Error(
    "Economy documents migration: na produkci chybí tabulka economy_documents. " +
      "Spusťte drizzle/0057_doklady.sql v Neon SQL Editoru (větev production) a build zopakujte.",
  );
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0057_doklady.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Economy documents migration (${env}): schema 0057 applied.`);
}

// Objednávky — „Odesláno“ a „Faktura poslána“ (migrace 0053, Lucie 18. 11. 2026).
//   • Preview (kopie databáze) → sloupce chybí → přidá je; jinak nic.
//   • Preview, kdyby DATABASE_URL ukazovala na produkční databázi → nic.
//   • Production → NIC NEMĚNÍ, jen ověří, že sloupce existují. SQL na
//     produkci spouští Jarin ručně v Neon SQL Editoru (soubor 0053);
//     dokud neproběhne, build se zastaví, aby web nespadl na chybějících
//     sloupcích.
//   • Jinde (lokálně, testy) → nic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
const COLUMNS = [
  "shipped_at", "shipped_by_user_id", "shipped_by_name",
  "invoice_sent_at", "invoice_sent_by_user_id", "invoice_sent_by_name", "invoice_sent_to", "invoice_sent_method",
];
const env = process.env.VERCEL_ENV;

if (env !== "production" && env !== "preview") {
  console.log("Order dispatch migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Order dispatch migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
const [{ count }] = await sql.query(
  `select count(*)::int as count from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = any($1)`,
  [COLUMNS],
);

if (count === COLUMNS.length) {
  console.log(`Order dispatch migration (${env}): 0053 already applied.`);
} else if (env === "production" || timeline === PRODUCTION_TIMELINE) {
  if (env === "preview") {
    console.log("Order dispatch migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    process.exit(0);
  }
  throw new Error(
    "Order dispatch migration: na produkci chybí sloupce Odesláno/Faktura poslána. " +
      "Spusťte drizzle/0053_objednavky_odeslano_faktura.sql v Neon SQL Editoru (větev production) a build zopakujte.",
  );
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0053_objednavky_odeslano_faktura.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Order dispatch migration (${env}): schema 0053 applied.`);
}

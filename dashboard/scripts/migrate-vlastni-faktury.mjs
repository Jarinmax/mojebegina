// Vlastní fakturace — tabulky invoice_number_counters a own_invoice_documents (migrace 0064).
// Na Production je zakládá Lucie skriptem docs/eshop-production/144_vlastni_faktury_MAIN.sql
// (s potvrzeným posledním číslem z iDokladu); tady JEN Preview (kopie databáze).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
if (process.env.VERCEL_ENV !== "preview") {
  console.log("Own invoices migration: skipped outside Vercel Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Own invoices migration: DATABASE_URL is missing.");
const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (timeline === PRODUCTION_TIMELINE) {
  console.log("Own invoices migration: Preview points to Production — skipped.");
  process.exit(0);
}
const [{ present }] = await sql.query(`SELECT to_regclass('public.own_invoice_documents') IS NOT NULL AS present`);
if (present) {
  console.log("Own invoices migration (preview): 0064 already applied.");
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0064_vlastni_faktury.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => [
    ...statements.map((s) => tx.query(s)),
    tx.query(`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 214) ON CONFLICT (year) DO NOTHING`),
  ]);
  console.log("Own invoices migration (preview): schema 0064 applied.");
}
const [{ present: v2 }] = await sql.query(`SELECT to_regclass('public.own_invoice_versions') IS NOT NULL AS present`);
if (v2) {
  console.log("Own invoices migration (preview): 0065 already applied.");
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0065_faktury_upravy.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log("Own invoices migration (preview): schema 0065 applied.");
}

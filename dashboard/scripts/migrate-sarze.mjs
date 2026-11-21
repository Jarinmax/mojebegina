// Šarže — tabulky production_batches a production_batch_lines (migrace 0058). Na Production ji
// zakládá Lucie skriptem docs/eshop-production/140_sarze_MAIN.sql;
// tady se zakládá JEN v Preview (kopie databáze), aby náhledy fungovaly.
// Preview nikdy nesmí migrovat produkční větev.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
if (process.env.VERCEL_ENV !== "preview") {
  console.log("Sarze migration: skipped outside Vercel Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Sarze migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (timeline === PRODUCTION_TIMELINE) {
  console.log("Sarze migration: Preview points to Production — skipped.");
  process.exit(0);
}
const [{ present }] = await sql.query(`SELECT to_regclass('public.production_batches') IS NOT NULL AS present`);
if (present) {
  console.log("Sarze migration (preview): 0058 already applied.");
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0058_sarze.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log("Sarze migration (preview): schema 0058 applied (production_batches).");
}
const [{ present: allocPresent }] = await sql.query(`SELECT to_regclass('public.production_batch_allocations') IS NOT NULL AS present`);
if (allocPresent) {
  console.log("Sarze migration (preview): 0059 already applied.");
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0059_sarze_objednavky.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log("Sarze migration (preview): schema 0059 applied (production_batch_allocations).");
}

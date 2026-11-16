// Receptury a náklady 1.0 — tabulky recipes, recipe_* (migrace 0046). Na Production je
// zakládá Lucie skriptem docs/eshop-production/123_receptury_MAIN.sql;
// tady se zakládá JEN v Preview (kopie databáze), aby náhledy fungovaly.
// Preview nikdy nesmí migrovat produkční větev.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
if (process.env.VERCEL_ENV !== "preview") {
  console.log("Receptury migration: skipped outside Vercel Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Receptury migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (timeline === PRODUCTION_TIMELINE) {
  console.log("Receptury migration: Preview points to Production — skipped.");
  process.exit(0);
}
const [{ present }] = await sql.query(`SELECT to_regclass('public.recipes') IS NOT NULL AS present`);
if (present) {
  console.log("Receptury migration (preview): 0046 already applied.");
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0046_receptury.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log("Receptury migration (preview): schema 0046 applied (recipes).");
}

// Ekonomika 1.1 — tabulka economy_entry_changes (migrace 0051). Na Production ji
// zakládá Lucie skriptem docs/eshop-production/129_ekonomika_historie_MAIN.sql;
// tady se zakládá JEN v Preview (kopie databáze), aby náhledy fungovaly.
// Preview nikdy nesmí migrovat produkční větev.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
if (process.env.VERCEL_ENV !== "preview") {
  console.log("Ekonomika historie migration: skipped outside Vercel Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Ekonomika historie migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (timeline === PRODUCTION_TIMELINE) {
  console.log("Ekonomika historie migration: Preview points to Production — skipped.");
  process.exit(0);
}
const [{ present }] = await sql.query(`SELECT to_regclass('public.economy_entry_changes') IS NOT NULL AS present`);
if (present) {
  console.log("Ekonomika historie migration (preview): 0051 already applied.");
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0051_ekonomika_historie.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log("Ekonomika historie migration (preview): schema 0051 applied (economy_entry_changes).");
}

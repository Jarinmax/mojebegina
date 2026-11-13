// Jarda — upozornění na naplánovaný hovor 1.0 — hlídaná přídavná migrace
// 0037, stejný princip jako migrate-lucie-work-entry-edit.mjs. Nová
// samostatná tabulka push_subscriptions + nový sloupec leads.scheduled_call_at
// (odděleně od next_follow_up_at, žádná existující data se nemění).
// Preview nikdy nesmí migrovat produkční větev.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
const env = process.env.VERCEL_ENV;
if (env !== "production" && env !== "preview") {
  console.log("Jarda call reminders migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Jarda call reminders migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
  console.log("Jarda call reminders migration: Preview points to Production — skipped.");
  process.exit(0);
}

const [{ hasTable }] = await sql.query(
  `select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'push_subscriptions') as "hasTable"`,
);
const [{ hasColumn }] = await sql.query(
  `select exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'scheduled_call_at') as "hasColumn"`,
);

if (hasTable && hasColumn) {
  console.log(`Jarda call reminders migration (${env}): 0037 already applied.`);
} else if (hasTable || hasColumn) {
  throw new Error("Jarda call reminders migration: partial state (table/column mismatch) — stopping safely.");
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0037_jarda-call-reminders.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Jarda call reminders migration (${env}): schema 0037 applied (push_subscriptions, leads.scheduled_call_at).`);
}

// Karta spolupracovnice — úprava/smazání zápisu práce 1.0 — hlídaná
// přídavná migrace 0036, stejný princip jako migrate-petr-vyroba.mjs.
// Jen nové sloupce na collaborator_work_entries (reward_type výchozí
// 'flat' pro starší řádky, rate_kc, updated_*, deleted_*); žádná
// existující data se nemění. Preview nikdy nesmí migrovat produkční větev.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
const env = process.env.VERCEL_ENV;
if (env !== "production" && env !== "preview") {
  console.log("Work entry edit migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Work entry edit migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
  console.log("Work entry edit migration: Preview points to Production — skipped.");
  process.exit(0);
}

const [{ n }] = await sql.query(
  `select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'collaborator_work_entries'
      and column_name in ('reward_type','rate_kc','updated_by','updated_at','deleted_by','deleted_at')`,
);
if (n === 6) {
  console.log(`Work entry edit migration (${env}): 0036 already applied.`);
} else if (n !== 0) {
  throw new Error(`Work entry edit migration: collaborator_work_entries has ${n} of 6 new columns — partial state, stopping safely.`);
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0036_lucie_work_entry_edit.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Work entry edit migration (${env}): schema 0036 applied (collaborator_work_entries edit/delete columns).`);
}

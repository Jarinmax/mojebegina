// Práce 1.0 — hlídaná migrace 0025 (work_tasks + work_task_activity) při
// buildu na Vercelu, stejný princip jako migrate-mcp-production.mjs (#36):
//   • Production: tabulky chybí → založí je a v TÉŽE transakci zapíše první
//     zadané úkoly (docs/prace/12_ukoly_jarda.sql); obě tabulky už jsou →
//     nic; jen jedna z nich → STOP (částečné schéma, nic se nezmění).
//   • Preview: totéž, ale JEN na Neon větvi Preview — pokud by DATABASE_URL
//     ukazovala na produkční databázi (timeline produkce), skript nic
//     nezmění. Produkce se tak nikdy nemění z Preview buildu.
//   • Jinde (lokálně, testy): nic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const TABLES = ["work_task_activity", "work_tasks"];
const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026
const env = process.env.VERCEL_ENV;

if (env !== "production" && env !== "preview") {
  console.log("Work tasks migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  throw new Error("Work tasks migration: DATABASE_URL is missing.");
}

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
  console.log("Work tasks migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
  process.exit(0);
}

const existing = await sql.query(
  `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[]) order by table_name`,
  [TABLES],
);
if (existing.length === TABLES.length) {
  console.log(`Work tasks migration (${env}): tables already exist.`);
  process.exit(0);
}
if (existing.length !== 0) {
  throw new Error(`Work tasks migration: partial schema detected (${existing.map((r) => r.table_name).join(", ")}); stopping safely.`);
}

const read = (rel) => readFile(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const migration = await read("../drizzle/0025_prace_1_0_work_tasks.sql");
const statements = migration
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);
const seed = await read("../docs/prace/12_ukoly_jarda.sql");

await sql.transaction((tx) => [...statements.map((s) => tx.query(s)), tx.query(seed)]);
console.log(`Work tasks migration (${env}): schema 0025 applied and first tasks created.`);

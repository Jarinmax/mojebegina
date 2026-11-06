// Práce 1.0/1.1/2.0 — hlídané migrace 0025 (work_tasks + work_task_activity),
// 0026 (zrušení úkolů, metadata historie) a 0027 (fotografie, schvalování) při
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

const read = (rel) => readFile(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const statementsOf = (text) =>
  text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

// --- 0025: tabulky + první úkoly -------------------------------------------
const existing = await sql.query(
  `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[]) order by table_name`,
  [TABLES],
);
if (existing.length === 0) {
  const statements = statementsOf(await read("../drizzle/0025_prace_1_0_work_tasks.sql"));
  const seed = await read("../docs/prace/12_ukoly_jarda.sql");
  await sql.transaction((tx) => [...statements.map((s) => tx.query(s)), tx.query(seed)]);
  console.log(`Work tasks migration (${env}): schema 0025 applied and first tasks created.`);
} else if (existing.length !== TABLES.length) {
  throw new Error(`Work tasks migration: partial schema detected (${existing.map((r) => r.table_name).join(", ")}); stopping safely.`);
} else {
  console.log(`Work tasks migration (${env}): 0025 already applied.`);
}

// --- 0026 (Práce 1.1): zrušení úkolů + metadata historie -------------------
// Hotovo = existuje sloupec work_tasks.cancelled_at. Jen přidání sloupců a
// rozšíření CHECK omezení; stávající úkoly zůstávají beze změny. Celé v jedné
// transakci — při chybě se nic nezmění (build skončí, běží dosavadní verze).
const [{ has0026 }] = await sql.query(
  `select count(*)::int > 0 as has0026 from information_schema.columns
    where table_schema = 'public' and table_name = 'work_tasks' and column_name = 'cancelled_at'`,
);
if (has0026) {
  console.log(`Work tasks migration (${env}): 0026 already applied.`);
} else {
  const statements = statementsOf(await read("../drizzle/0026_prace_1_1_task_management.sql"));
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Work tasks migration (${env}): schema 0026 applied (task management).`);
}

// --- 0027 (Práce 2.0): fotografie, schvalování, stavy submitted/returned ---
// Hotovo = existuje sloupec work_tasks.photo_requirement. Nová tabulka
// work_task_photos, nové sloupce s výchozími hodnotami (žádná fotka, bez
// schválení) a rozšířené CHECK omezení; stávající úkoly a historie beze změny.
const [{ has0027 }] = await sql.query(
  `select count(*)::int > 0 as has0027 from information_schema.columns
    where table_schema = 'public' and table_name = 'work_tasks' and column_name = 'photo_requirement'`,
);
if (has0027) {
  console.log(`Work tasks migration (${env}): 0027 already applied.`);
} else {
  const statements = statementsOf(await read("../drizzle/0027_prace_2_0_photos_approval.sql"));
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Work tasks migration (${env}): schema 0027 applied (photos, approval).`);
}

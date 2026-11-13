// Google Kalendář + Denní volání 1.1 — hlídané migrace při buildu na Vercelu,
// stejný princip jako migrate-sklad.mjs / migrate-work-tasks.mjs:
//   • 0038 (google_calendar_connections, lead_calendar_sync) a hned v TÉŽE
//     transakci převod starých termínů „jen datum“ (uložené jako 12:00 UTC)
//     na 09:00 Europe/Prague téhož dne (docs/google-kalendar/21_terminy_prevod.sql,
//     se zálohou lead_follow_up_k8_backup a vlastními pojistkami). Převod musí
//     proběhnout dřív, než nový kód zapíše první termín s časem — proto spolu
//     s vytvořením tabulek, a jen jednou.
//     Obě tabulky už jsou → nic; jen jedna → STOP (částečné schéma).
//   • 0039 (daily_call_queue.resulting_activity_id) — hotovo = sloupec existuje.
//   • Preview: jen na Neon větvi Preview (DATABASE_URL na produkční timeline →
//     nic se nezmění). Jinde (lokálně, testy) nic.
// Při chybě se transakce vrátí, build skončí a dál běží dosavadní verze.
// Vrácení převodu: docs/google-kalendar/29_terminy_navrat.sql.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

export const CALENDAR_TABLES = ["google_calendar_connections", "lead_calendar_sync"];
const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026

export const statementsOf = (text) =>
  text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

const read = (rel) => readFile(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

export async function runGoogleCalendarMigration() {
  const env = process.env.VERCEL_ENV;
  if (env !== "production" && env !== "preview") {
    console.log("Google Calendar migration: skipped outside Vercel Production/Preview.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Google Calendar migration: DATABASE_URL is missing.");
  }

  const sql = neon(process.env.DATABASE_URL);
  const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
  if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
    console.log("Google Calendar migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
    return;
  }

  // --- 0038 + převod starých termínů ---------------------------------------
  const existing = await sql.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[]) order by table_name`,
    [CALENDAR_TABLES],
  );
  if (existing.length === 0) {
    const statements = statementsOf(await read("../drizzle/0038_google_kalendar.sql"));
    const conversion = (await read("../docs/google-kalendar/21_terminy_prevod.sql")).trim();
    await sql.transaction((tx) => [...statements.map((s) => tx.query(s)), tx.query(conversion)]);
    console.log(`Google Calendar migration (${env}): schema 0038 applied and old date-only follow-ups converted to 09:00 Prague.`);
  } else if (existing.length !== CALENDAR_TABLES.length) {
    throw new Error(`Google Calendar migration: partial schema detected (${existing.map((r) => r.table_name).join(", ")}); stopping safely.`);
  } else {
    console.log(`Google Calendar migration (${env}): 0038 already applied.`);
  }

  // --- 0039: vazba položky fronty na aktivitu -----------------------------
  const [{ has0039 }] = await sql.query(
    `select count(*)::int > 0 as has0039 from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_call_queue' and column_name = 'resulting_activity_id'`,
  );
  if (has0039) {
    console.log(`Google Calendar migration (${env}): 0039 already applied.`);
  } else {
    const statements = statementsOf(await read("../drizzle/0039_denni_volani_1_1_historie.sql"));
    await sql.transaction((tx) => statements.map((s) => tx.query(s)));
    console.log(`Google Calendar migration (${env}): schema 0039 applied (daily calls history).`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runGoogleCalendarMigration();
}

// Karty spolupracovníků 1.0 — hlídaná přídavná migrace 0032.
// Vytváří jen nové tabulky a výchozí prázdnou Luciinu kartu; žádná
// existující firemní data neupravuje. Preview nikdy nesmí migrovat
// produkční větev.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
const env = process.env.VERCEL_ENV;
if (env !== "production" && env !== "preview") {
  console.log("Collaborators migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("Collaborators migration: DATABASE_URL is missing.");

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
  console.log("Collaborators migration: Preview points to Production — skipped.");
  process.exit(0);
}

const expected = [
  "collaborator_cards",
  "collaborator_work_entries",
  "collaborator_products",
  "collaborator_product_movements",
  "collaborator_payouts",
];
const rows = await sql.query(
  `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
  [expected],
);
if (rows.length === expected.length) {
  console.log(`Collaborators migration (${env}): 0032 already applied.`);
  process.exit(0);
}
if (rows.length !== 0) throw new Error(`Collaborators migration: partial schema detected (${rows.map((r) => r.table_name).join(", ")}); stopping safely.`);

const migration = await readFile(fileURLToPath(new URL("../drizzle/0032_spolupracovnici_1_0.sql", import.meta.url)), "utf8");
const statements = migration.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
await sql.transaction((tx) => statements.map((statement) => tx.query(statement)));
console.log(`Collaborators migration (${env}): schema 0032 and Lucie card applied.`);


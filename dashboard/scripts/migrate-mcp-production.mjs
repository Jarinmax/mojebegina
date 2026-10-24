import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const TABLES = [
  "agent_audit_log",
  "agent_grants",
  "agent_tokens",
  "organization_activity",
];

if (process.env.VERCEL_ENV !== "production") {
  console.log("MCP migration: skipped outside Production.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  throw new Error("MCP migration: DATABASE_URL is missing.");
}

const sql = neon(process.env.DATABASE_URL);
const existing = await sql.query(
  `select table_name
     from information_schema.tables
    where table_schema = 'public'
      and table_name = any($1::text[])
    order by table_name`,
  [TABLES],
);

if (existing.length === TABLES.length) {
  console.log("MCP migration: all tables already exist.");
  process.exit(0);
}

if (existing.length !== 0) {
  throw new Error(
    `MCP migration: partial schema detected (${existing.map((row) => row.table_name).join(", ")}); stopping safely.`,
  );
}

const migrationUrl = new URL("../drizzle/0024_gpt_mcp_production.sql", import.meta.url);
const migration = await readFile(fileURLToPath(migrationUrl), "utf8");
const statements = migration
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

await sql.transaction((tx) => statements.map((statement) => tx.query(statement)));
console.log("MCP migration: production schema 0024 applied.");

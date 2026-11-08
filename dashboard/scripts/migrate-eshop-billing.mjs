// E-shop — hlídaná migrace 0034 (fakturační a doručovací údaje z pokladny
// u objednávek, zadání Lucie 8. 11. 2026) při buildu na Vercelu, stejný
// princip jako migrate-sklad-dodavatel-volitelny.mjs:
//   • Production/Preview, sloupce chybí → přidá je (všechny NULL, stávající
//     objednávky se nemění); už existují → nic.
//   • Preview, kdyby DATABASE_URL ukazovala na produkční databázi → nic.
//   • Jinde (lokálně, testy) → nic.
// Jen nové nepovinné sloupce a dvě kontroly, které NULL propustí. Jedna transakce.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026
const env = process.env.VERCEL_ENV;

if (env !== "production" && env !== "preview") {
  console.log("Billing details migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  throw new Error("Billing details migration: DATABASE_URL is missing.");
}

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
  console.log("Billing details migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
  process.exit(0);
}

const [{ n }] = await sql.query(
  `select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name in ('billing_name','billing_company','billing_ico','billing_dic','billing_street',
                          'billing_city','billing_zip','billing_country','recipient_company','delivery_same_as_billing')`,
);

if (n === 10) {
  console.log(`Billing details migration (${env}): 0034 already applied.`);
} else if (n !== 0) {
  throw new Error(`Billing details migration: orders has ${n} of 10 new columns — partial state, stopping safely.`);
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0034_eshop_fakturacni_udaje.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Billing details migration (${env}): schema 0034 applied (orders billing/delivery columns).`);
}

// E-shop — hlídaná migrace 0028 (tabulka eshop_coupons pro slevové kódy,
// zadání Lucie 6. 11. 2026) při buildu na Vercelu, stejný princip jako
// migrate-work-tasks.mjs:
//   • Production: tabulka chybí → založí ji (prázdnou — kupóny se vkládají
//     zvlášť podle WooCommerce); už existuje → nic.
//   • Preview: totéž, ale JEN na Neon větvi Preview — pokud by DATABASE_URL
//     ukazovala na produkční databázi, skript nic nezmění.
//   • Jinde (lokálně, testy): nic.
// Jen nová tabulka, žádná změna stávajících dat. Jedna transakce.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026
const env = process.env.VERCEL_ENV;

if (env !== "production" && env !== "preview") {
  console.log("Coupons migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  throw new Error("Coupons migration: DATABASE_URL is missing.");
}

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
  console.log("Coupons migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
  process.exit(0);
}

const [{ exists, hasOrg }] = await sql.query(
  `select count(*)::int > 0 as exists,
          (select count(*)::int > 0 from information_schema.columns
            where table_schema = 'public' and table_name = 'eshop_coupons' and column_name = 'organization_id') as "hasOrg"
     from information_schema.tables where table_schema = 'public' and table_name = 'eshop_coupons'`,
);
// Preview mohl dostat dřívější návrh tabulky (bez organization_id) — je-li
// prázdná, založí se znovu; s daty se nic nemění (STOP).
if (exists && !hasOrg) {
  const [{ n }] = await sql.query(`select count(*)::int as n from eshop_coupons`);
  if (n > 0) throw new Error("Coupons migration: old eshop_coupons table with data; stopping safely.");
  await sql.query(`drop table eshop_coupons`);
  console.log(`Coupons migration (${env}): empty draft table dropped, recreating.`);
}
if (exists && hasOrg) {
  console.log(`Coupons migration (${env}): 0028 already applied.`);
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0028_eshop_coupons.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Coupons migration (${env}): schema 0028 applied (eshop_coupons, empty).`);
}

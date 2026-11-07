// Sklad — hlídaná migrace 0033 (goods_receipts.supplier_id volitelný —
// "Nová příjemka" jde založit a vyfotit i bez dodavatele, appka ho dohledá
// nebo založí sama podle vytěžení fotky) při buildu na Vercelu, stejný
// princip jako migrate-order-fulfillment.mjs:
//   • Production/Preview, sloupec je NOT NULL → uvolní ho (žádná stávající
//     data se nemění, jen omezení); už je nullable → nic.
//   • Preview, kdyby DATABASE_URL ukazovala na produkční databázi → nic.
//   • Jinde (lokálně, testy) → nic.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026
const env = process.env.VERCEL_ENV;

if (env !== "production" && env !== "preview") {
  console.log("Sklad dodavatel volitelny migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  throw new Error("Sklad dodavatel volitelny migration: DATABASE_URL is missing.");
}

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
  console.log("Sklad dodavatel volitelny migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
  process.exit(0);
}

const columnRows = await sql.query(
  `select (is_nullable = 'YES') as "isNullable" from information_schema.columns
    where table_schema = 'public' and table_name = 'goods_receipts' and column_name = 'supplier_id'`,
);

if (columnRows.length === 0) {
  console.log("Sklad dodavatel volitelny migration: goods_receipts.supplier_id not found yet (sklad 0030/0031 not applied) — skipped.");
} else if (columnRows[0].isNullable) {
  console.log(`Sklad dodavatel volitelny migration (${env}): 0033 already applied.`);
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0033_sklad_1_0_dodavatel_volitelny.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Sklad dodavatel volitelny migration (${env}): schema 0033 applied (goods_receipts.supplier_id nullable).`);
}

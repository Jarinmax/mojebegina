// Objednávky — hlídaná migrace 0029 (orders.carrier, orders.tracking_number
// — MCP „Plánování rozvozů“, nový stav handed_to_carrier) při buildu na
// Vercelu, stejný princip jako migrate-eshop-coupons.mjs:
//   • Production/Preview, sloupce chybí → přidá je (NULL u všech
//     existujících objednávek — appka to čte jako „zatím bez přepravce“);
//     už existují → nic.
//   • Preview, kdyby DATABASE_URL ukazovala na produkční databázi → nic.
//   • Jinde (lokálně, testy) → nic.
// Jen přidává nullable sloupce, žádná stávající data se nemění.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182"; // ověřeno read-only 27. 10. 2026
const env = process.env.VERCEL_ENV;

if (env !== "production" && env !== "preview") {
  console.log("Order fulfillment migration: skipped outside Vercel Production/Preview.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  throw new Error("Order fulfillment migration: DATABASE_URL is missing.");
}

const sql = neon(process.env.DATABASE_URL);
const [{ timeline }] = await sql.query(`SELECT current_setting('neon.timeline_id', true) AS timeline`);
if (env === "preview" && timeline === PRODUCTION_TIMELINE) {
  console.log("Order fulfillment migration: Preview build points to the PRODUCTION database — skipped, nothing changed.");
  process.exit(0);
}

const [{ hasCarrier, hasTracking }] = await sql.query(
  `select (select count(*)::int > 0 from information_schema.columns
            where table_schema = 'public' and table_name = 'orders' and column_name = 'carrier') as "hasCarrier",
          (select count(*)::int > 0 from information_schema.columns
            where table_schema = 'public' and table_name = 'orders' and column_name = 'tracking_number') as "hasTracking"`,
);

if (hasCarrier && hasTracking) {
  console.log(`Order fulfillment migration (${env}): 0029 already applied.`);
} else if (hasCarrier !== hasTracking) {
  throw new Error("Order fulfillment migration: partial schema detected (carrier/tracking_number); stopping safely.");
} else {
  const text = await readFile(fileURLToPath(new URL("../drizzle/0029_objednavky_1_1_rozvoz_carrier_tracking.sql", import.meta.url)), "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction((tx) => statements.map((s) => tx.query(s)));
  console.log(`Order fulfillment migration (${env}): schema 0029 applied (orders.carrier, orders.tracking_number).`);
}

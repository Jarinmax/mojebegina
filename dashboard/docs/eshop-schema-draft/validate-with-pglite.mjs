// Ověření SQL návrhu ESHOP 1.0 na dočasné Postgres databázi v paměti (PGlite).
// NIKDY se nepřipojuje k Neonu. Spuštění (mimo projekt, ať se nemění package.json):
//   mkdir /tmp/pgl && cd /tmp/pgl && npm i @electric-sql/pglite
//   cp <repo>/dashboard/docs/eshop-schema-draft/validate-with-pglite.mjs .
//   DRAFT_DIR=<repo>/dashboard/docs/eshop-schema-draft node validate-with-pglite.mjs
// Nahraje stávající migrace 0000–0010, data jako v produkci (26. 9. 2026),
// projde kroky 01–07 nahoru, testy omezení a všechny kroky dolů.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const D = process.env.DRAFT_DIR;
if (!D) throw new Error("Nastavte DRAFT_DIR na složku dashboard/docs/eshop-schema-draft");
const MIG = `${D}/../../drizzle`;
const db = new PGlite();
const f = (n) => readFileSync(`${D}/${n}`, "utf8");
let ok = 0, fail = 0;
async function step(name, sql) { try { await db.exec(sql); ok++; console.log("✓", name); } catch (e) { fail++; console.log("✗", name, "→", e.message); } }
async function mustFail(name, sql) { try { await db.exec(sql); fail++; console.log("✗ (mělo selhat)", name); } catch (e) { ok++; console.log("✓ odmítnuto:", name, "—", e.message.split("\n")[0]); } }
async function q(sql) { return (await db.query(sql)).rows; }

for (const file of readdirSync(MIG).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(`${MIG}/${file}`, "utf8").replaceAll("--> statement-breakpoint", ""));
}
console.log("stávající migrace 0000–0010 nahrány");
// data podobná produkci (26. 9. 2026)
await db.exec(`
INSERT INTO organizations (id, ico, name, registered_address) VALUES ('11111111-1111-1111-1111-111111111111','11935367','The Cup s.r.o.','Praha');
INSERT INTO orders (id, buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status) VALUES
 ('329f54d5-5a7d-4522-a21e-b7ad9cde24e2','11111111-1111-1111-1111-111111111111',758,0,758,'paid','delivered'),
 ('984e3645-1f2f-4444-8e8e-eeac75165a0a','11111111-1111-1111-1111-111111111111',1137,0,1137,'paid','delivered');
INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES
 ('329f54d5-5a7d-4522-a21e-b7ad9cde24e2','Dýňová polévka',1,379,379),('329f54d5-5a7d-4522-a21e-b7ad9cde24e2','Kulajda',1,379,379),
 ('984e3645-1f2f-4444-8e8e-eeac75165a0a','Dýňová polévka',1,379,379),('984e3645-1f2f-4444-8e8e-eeac75165a0a','Kulajda',1,379,379),
 ('984e3645-1f2f-4444-8e8e-eeac75165a0a','Rajčatová polévka',1,379,379);`);

const pre = f("00_preflight_checks.sql").split(";").map((s) => s.trim()).filter((s) => /select/i.test(s));
for (const s of pre) console.log("preflight:", JSON.stringify(await q(s)).slice(0, 160));

await step("01 produkty up", f("01_products_up.sql"));
await step("02 seed", f("02_products_seed.sql"));
await step("02 seed znovu (idempotence)", f("02_products_seed.sql"));
console.log("počty:", JSON.stringify(await q(`SELECT (SELECT count(*) FROM product_categories) c,(SELECT count(*) FROM products) p,(SELECT count(*) FROM product_variants) v,(SELECT count(*) FROM product_images) i`)));
console.log("svařák:", JSON.stringify(await q(`SELECT sku, price_b2c_kc, volume_ml, servings FROM product_variants WHERE sku LIKE 'svarak%' ORDER BY sku`)));
console.log("alkohol:", JSON.stringify(await q(`SELECT slug, alcohol_percent, is_age_restricted FROM products WHERE alcohol_percent IS NOT NULL ORDER BY slug`)));
await step("03 order_activity up", f("03_order_activity_actor_up.sql"));
await step("04 orders pole up", f("04_orders_eshop_fields_up.sql"));
console.log("kanály:", JSON.stringify(await q(`SELECT channel, count(*) FROM orders GROUP BY channel`)));
await step("05 order_items up", f("05_order_items_variant_up.sql"));
await step("06a číslo sloupec up", f("06a_order_number_column_up.sql"));
await mustFail("06b s nevyplněným placeholderem", f("06b_order_number_cutover_up.sql"));
await step("06b přepnutí (MAX Woo = 5093)", f("06b_order_number_cutover_up.sql").replaceAll("<MAX_WOO_ORDER_NUMBER>", "5093"));
await step("07 guest up", f("07_orders_guest_up.sql"));

// chování po migraci
await step("e-shop objednávka bez organizace (batch jako createOrder)", `
INSERT INTO orders (id, channel, contact_name, contact_email, subtotal_kc, shipping_kc, total_kc, payment_status, shipping_method_code, age_confirmed_at, terms_accepted_at)
 VALUES ('22222222-2222-2222-2222-222222222222','eshop','Jana N.','jana@example.cz',499,99,598,'unpaid','rozvoz',now(),now());
INSERT INTO order_items (order_id, product_variant_id, sku_snapshot, name, quantity, unit_price_kc, line_total_kc)
 SELECT '22222222-2222-2222-2222-222222222222', id, sku, 'Svařák Deluxe — 3 l', 1, price_b2c_kc, price_b2c_kc FROM product_variants WHERE sku='svarak-deluxe-3l';
INSERT INTO order_activity (order_id, actor_type, author_name, kind) VALUES ('22222222-2222-2222-2222-222222222222','system','E-shop','created');`);
console.log("čísla:", JSON.stringify(await q(`SELECT channel, order_number FROM orders ORDER BY ordered_at`)));
await step("ruční objednávka s organizací dostane další číslo", `INSERT INTO orders (buyer_organization_id, subtotal_kc, total_kc, payment_status) VALUES ('11111111-1111-1111-1111-111111111111',379,379,'unpaid')`);
console.log("čísla:", JSON.stringify(await q(`SELECT channel, order_number FROM orders ORDER BY order_number NULLS FIRST`)));
await step("import Woo objednávky s původním číslem 5090", `INSERT INTO orders (channel, order_number, external_woocommerce_id, contact_email, subtotal_kc, total_kc, payment_status) VALUES ('import',5090,'5090','x@example.cz',349,349,'paid')`);
await mustFail("import s číslem, které už nová řada vydala (duplicita)", `INSERT INTO orders (channel, order_number, contact_email, subtotal_kc, total_kc, payment_status) VALUES ('import',5094,'y@example.cz',1,1,'paid')`);
await mustFail("ruční objednávka bez organizace", `INSERT INTO orders (subtotal_kc, total_kc, payment_status) VALUES (1,1,'unpaid')`);
await mustFail("guest bez e-mailu", `INSERT INTO orders (channel, subtotal_kc, total_kc, payment_status) VALUES ('eshop',1,1,'unpaid')`);
await mustFail("nesedící součet", `INSERT INTO orders (buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status) VALUES ('11111111-1111-1111-1111-111111111111',100,50,100,'unpaid')`);
await mustFail("nesedící řádek položky", `INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES ('22222222-2222-2222-2222-222222222222','x',2,10,10)`);
await mustFail("vazba bez SKU snapshotu", `INSERT INTO order_items (order_id, product_variant_id, name, quantity, unit_price_kc, line_total_kc) SELECT '22222222-2222-2222-2222-222222222222', id, 'x',1,1,1 FROM product_variants LIMIT 1`);
await mustFail("uživatelský záznam aktivity bez autora", `INSERT INTO order_activity (order_id, kind) VALUES ('22222222-2222-2222-2222-222222222222','note_added')`);
await mustFail("alkohol bez 18+", `UPDATE products SET is_age_restricted=false WHERE slug='svarak-deluxe'`);
await mustFail("neznámý alergen", `UPDATE products SET allergens=ARRAY['lepek'] WHERE slug='kulajda'`);
await mustFail("smazání prodaného balení", `DELETE FROM product_variants WHERE sku='svarak-deluxe-3l'`);
await step("přejmenování SKU nerozbije historii", `UPDATE product_variants SET sku='svarak-deluxe-3l-new' WHERE sku='svarak-deluxe-3l'; UPDATE product_variants SET sku='svarak-deluxe-3l' WHERE sku='svarak-deluxe-3l-new'`);
await mustFail("07 down, když existuje guest objednávka", f("07_orders_guest_down.sql"));

// úklid testovacích řádků a návrat v opačném pořadí
await db.exec(`DELETE FROM order_activity WHERE actor_type <> 'user'; DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE channel IN ('eshop') OR order_number IS NOT NULL AND channel='manual' OR external_woocommerce_id IS NOT NULL OR order_number = 5094);
DELETE FROM orders WHERE channel='eshop' OR external_woocommerce_id IS NOT NULL OR (channel='manual');`);
for (const d of ["07_orders_guest_down.sql","06b_order_number_cutover_down.sql","06a_order_number_column_down.sql","05_order_items_variant_down.sql","04_orders_eshop_fields_down.sql","03_order_activity_actor_down.sql","02_products_seed_down.sql","01_products_down.sql"]) await step("down " + d, f(d));
console.log("po návratu:", JSON.stringify(await q(`SELECT count(*) orders, (SELECT count(*) FROM order_items) items, (SELECT count(*) FROM information_schema.columns WHERE table_name='orders') order_cols, (SELECT is_nullable FROM information_schema.columns WHERE table_name='orders' AND column_name='buyer_organization_id') org_nullable, (SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'product%') product_tables FROM orders`)));
console.log(`\nVÝSLEDEK: ${ok} v pořádku, ${fail} chyb`);

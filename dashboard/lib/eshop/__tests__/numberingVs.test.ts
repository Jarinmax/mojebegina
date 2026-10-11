// Číslování „číslo objednávky = VS“ (docs/eshop-production/30–39_cislovani_vs*)
// nad PGlite se všemi migracemi a daty jako v Production 10. 10. 2026.
// Pravidlo pro všechny typy: eshop i manual mají číslo = VS z jedné řady,
// import nemá ani jedno (případné číslo WooCommerce jen pod 70000000).
// Data:
// 2 objednávky The Cup (import), 1 stornovaná e-shopová s VS 70000001,
// payment_vs_seq = 1, žádná objednávka s číslem. Ověřuje přesně soubory,
// které by se spouštěly v Neon SQL Editoru.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { applyOrderNumbering, createMigratedDb } from "./helpers/migratedDb";

const DB_TEST = { timeout: 120_000 };
const DIR = path.join(__dirname, "../../../docs/eshop-production");
const file = (name: string) => readFileSync(path.join(DIR, name), "utf8");
const ORG = "11111111-1111-4111-8111-111111111111";
const VS = `'7' || lpad(nextval('payment_vs_seq')::text, 7, '0')`; // = PAYMENT_VS_SQL

async function productionLikeDb(): Promise<PGlite> {
  const { pg } = await createMigratedDb();
  await pg.exec(`
    INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG}', '11935367', 'The Cup s.r.o.', 'Praha');
    INSERT INTO orders (channel, buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at) VALUES
      ('import', '${ORG}', 758, 0, 758, 'paid', 'delivered', '2026-08-30'),
      ('import', '${ORG}', 1137, 0, 1137, 'paid', 'delivered', '2026-09-03');
    INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs)
      VALUES ('eshop', 'test@example.cz', 349, 349, 'unpaid', 'cancelled', '2026-10-08T16:56:46Z', ${VS});`);
  return pg;
}

async function check(pg: PGlite, name: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(file(name).replace(/--[^\n]*\n/g, ""));
  return Object.values(rows[0]).map(String).join(" | ");
}

const eshopOrder = (pg: PGlite) =>
  pg.query<{ n: string; vs: string }>(
    `INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status, payment_vs)
     VALUES ('eshop', 'jana@example.cz', 379, 379, 'unpaid', ${VS}) RETURNING order_number::text AS n, payment_vs AS vs`
  );
const manualOrder = (pg: PGlite, orderedAt = "now()") =>
  pg.query<{ n: string; vs: string | null }>(
    `INSERT INTO orders (buyer_organization_id, subtotal_kc, total_kc, payment_status, ordered_at)
     VALUES ('${ORG}', 500, 500, 'unpaid', ${orderedAt}) RETURNING order_number::text AS n, payment_vs AS vs`
  );

describe("číslování = VS (návrh 10. 10. 2026)", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await productionLikeDb();
  }, DB_TEST.timeout);

  it("kontrola před = stav Production", async () => {
    expect(await check(pg, "30_cislovani_vs_before.sql")).toBe("0 | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 70000001");
  });

  it("zapnutí: testovací objednávka dostane 70000001 (svůj VS), import zůstane bez čísla; další = 70000002", async () => {
    await pg.exec(file("31_cislovani_vs.sql"));
    expect(await check(pg, "32_cislovani_vs_after.sql")).toBe("1 | 2 | 2 | 0 | 0 | 70000001 | 70000002");
  });

  it("nové objednávky: e-shop i ruční číslo = VS z téže řady — žádné číslo dvakrát", async () => {
    expect((await eshopOrder(pg)).rows[0]).toEqual({ n: "70000002", vs: "70000002" });
    expect((await manualOrder(pg)).rows[0]).toEqual({ n: "70000003", vs: "70000003" });
    expect((await eshopOrder(pg)).rows[0]).toEqual({ n: "70000004", vs: "70000004" });
    const { rows } = await pg.query<{ dup: number }>(
      `SELECT count(*)::int AS dup FROM orders a JOIN orders b ON a.id <> b.id
       AND (a.payment_vs = b.payment_vs OR a.order_number = b.order_number OR a.payment_vs::bigint = b.order_number)`
    );
    expect(rows[0].dup).toBe(0);
  });

  it("pojistky: číslo nejde změnit ani vložit jiné než VS; import mimo řadu", async () => {
    await expect(pg.exec(`UPDATE orders SET order_number = 70000099 WHERE payment_vs = '70000001'`)).rejects.toThrow(/neměnný/);
    await expect(
      pg.exec(`INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status, payment_vs, order_number)
               VALUES ('eshop', 'x@example.cz', 1, 1, 'unpaid', ${VS}, 5209)`)
    ).rejects.toThrow(/orders_number_equals_vs/);
    await expect(
      pg.exec(`INSERT INTO orders (buyer_organization_id, subtotal_kc, total_kc, payment_status, order_number)
               VALUES ('${ORG}', 1, 1, 'unpaid', 5209)`)
    ).rejects.toThrow(/orders_number_equals_vs/);
    // import: bez čísla, nebo s původním číslem WooCommerce; nikdy z řady 7xxxxxxx
    const imp = (cols: string, vals: string) =>
      pg.exec(`INSERT INTO orders (channel, buyer_organization_id, subtotal_kc, total_kc, payment_status${cols})
               VALUES ('import', '${ORG}', 1, 1, 'paid'${vals})`);
    await imp("", "");
    await imp(", order_number", ", 5208");
    await expect(imp(", order_number", ", 70000050")).rejects.toThrow(/orders_import_outside_series/);
    await expect(imp(", payment_vs", ", '70000050'")).rejects.toThrow(/orders_import_outside_series/);
    const { rows } = await pg.query<{ n: string | null }>(`SELECT order_number::text AS n FROM orders WHERE channel = 'import' ORDER BY order_number NULLS FIRST`);
    expect(rows.map((r) => r.n)).toEqual([null, null, null, "5208"]);
  });

  it("druhé spuštění se zastaví a nic nezmění", async () => {
    await expect(pg.exec(file("31_cislovani_vs.sql"))).rejects.toThrow(/už je zapnuté/);
  });

  it("návrat: nové objednávky bez čísla (e-shop dál VS), přidělená čísla zůstanou; znovuzapnutí odmítne", async () => {
    await pg.exec(file("39_cislovani_vs_rollback.sql"));
    expect((await eshopOrder(pg)).rows[0]).toEqual({ n: null, vs: expect.stringMatching(/^7\d{7}$/) });
    const { rows } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM orders WHERE order_number >= 70000000`);
    expect(rows[0].n).toBe(4);
    await expect(pg.exec(file("31_cislovani_vs.sql"))).rejects.toThrow(/už číslo má/);
  });

  it("ruční objednávky vzniklé před zapnutím dostanou VS a číslo z řady podle data", async () => {
    const db = await productionLikeDb();
    await manualOrder(db, "'2026-10-09'");
    await db.exec(file("31_cislovani_vs.sql"));
    const { rows } = await db.query(`SELECT channel, order_number::text AS n, payment_vs AS vs FROM orders WHERE order_number IS NOT NULL ORDER BY order_number`);
    expect(rows).toEqual([
      { channel: "eshop", n: "70000001", vs: "70000001" },
      { channel: "manual", n: "70000002", vs: "70000002" },
    ]);
    expect((await eshopOrder(db)).rows[0]).toEqual({ n: "70000003", vs: "70000003" });
  });

  it("na Preview (řada 900001+) se skript nespustí", async () => {
    const db = await productionLikeDb();
    await applyOrderNumbering(db, 900000);
    await expect(db.exec(file("31_cislovani_vs.sql"))).rejects.toThrow(/order_number_seq/);
  });
});

// Skutečný kód aplikace (pokladna přes ovladač Neonu, ruční objednávka
// stejnými hodnotami jako MojeBegina createOrder) nad PGlite se zapnutým
// číslováním 31 — bez jediné změny v kódu.
describe("číslování = VS — kód aplikace", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeAll(async () => {
    process.env.E2E_ORDER_NUMBERING = "vs";
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
  }, 60_000);

  it("pokladna vrátí číslo = VS (i při opakovaném odeslání), ruční objednávka další číslo = VS", async () => {
    const { validateCheckoutInput } = await import("../checkout");
    const { saveEshopOrder } = await import("../orderWrite");
    const { catalogIndex } = await import("./helpers/catalogFixture");
    const { orders, organizations } = await import("@/lib/db/schema");
    const checkout = validateCheckoutInput(
      {
        cart: JSON.stringify([{ sku: "kulajda", quantity: 1 }]),
        name: "Jana Nováková",
        email: "jana@example.cz",
        phone: "+420 777 123 456",
        shippingMethodId: "osobni-odber",
        paymentMethodId: "prevod",
        street: "",
        city: "",
        zip: "",
        note: "",
        termsAccepted: true,
        ageConfirmed: false,
      },
      catalogIndex
    );
    if (!checkout.ok) throw new Error(checkout.error);
    const id = "5d0c3b8e-6f7a-4b1c-9d2e-1a2b3c4d5e6f";
    expect(await saveEshopOrder(db, id, checkout.value)).toMatchObject({ ok: true, orderNumber: 70000001, paymentVs: "70000001" });
    expect(await saveEshopOrder(db, id, checkout.value)).toMatchObject({ orderNumber: 70000001, alreadySaved: true });

    await db.insert(organizations).values({ id: ORG, ico: "11935367", name: "The Cup s.r.o.", registeredAddress: "Praha" });
    const [manual] = await db
      .insert(orders)
      .values({ buyerOrganizationId: ORG, subtotalKc: 500, shippingKc: 0, totalKc: 500, paymentStatus: "unpaid", fulfillmentStatus: "new" })
      .returning({ orderNumber: orders.orderNumber, paymentVs: orders.paymentVs });
    expect(manual).toEqual({ orderNumber: 70000002, paymentVs: "70000002" });

    // Náhradní objednávka za stornovanou (skutečný createReplacementOrder):
    // VS i číslo z téže řady; původní si své číslo i VS ponechá.
    const { recordManualPayment } = await import("../payments");
    const { createReplacementOrder } = await import("../cancellation");
    await recordManualPayment(db, {
      orderId: id, token: "c0ffee00-0000-4000-8000-000000000001", method: "bank_transfer", amountHal: 37900,
      occurredAt: new Date(), note: null, vs: "70000001", user: { userId: "admin-1", name: "Lucie Test" },
    });
    await db.execute(sql`UPDATE orders SET fulfillment_status = 'cancelled' WHERE id = ${id}`);
    const replacementId = "5d0c3b8e-6f7a-4b1c-9d2e-1a2b3c4d5e70";
    const replacement = await createReplacementOrder(db, {
      fromOrderId: id, newOrderId: replacementId, value: checkout.value, consentNote: "telefonicky",
      user: { userId: "admin-1", name: "Lucie Test" },
    });
    expect(replacement).toMatchObject({ ok: true });
    const rows = (await db.execute(sql`SELECT id, order_number::text AS n, payment_vs AS vs FROM orders WHERE id IN (${id}, ${replacementId}) ORDER BY order_number`)).rows;
    expect(rows).toEqual([
      { id, n: "70000001", vs: "70000001" },
      { id: replacementId, n: "70000003", vs: "70000003" },
    ]);
  });
});

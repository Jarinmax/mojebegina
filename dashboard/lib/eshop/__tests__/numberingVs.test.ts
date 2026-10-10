// Číslování „číslo objednávky = VS“ (docs/eshop-production/30–39_cislovani_vs*)
// nad PGlite se všemi migracemi a daty jako v Production 10. 10. 2026:
// 2 objednávky The Cup (import), 1 stornovaná e-shopová s VS 70000001,
// payment_vs_seq = 1, žádná objednávka s číslem. Ověřuje přesně soubory,
// které by se spouštěly v Neon SQL Editoru.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
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
    expect(await check(pg, "30_cislovani_vs_before.sql")).toBe("0 | 0 | 2 | 1 | 0 | 0 | 0 | 70000001");
  });

  it("zapnutí: testovací objednávka dostane 70000001 (svůj VS), import zůstane bez čísla; další = 70000002", async () => {
    await pg.exec(file("31_cislovani_vs.sql"));
    expect(await check(pg, "32_cislovani_vs_after.sql")).toBe("1 | 3 | 2 | 0 | 0 | 70000001 | 70000002");
  });

  it("nové objednávky: e-shop číslo = VS, ruční další číslo z téže řady bez VS — žádné číslo dvakrát", async () => {
    expect((await eshopOrder(pg)).rows[0]).toEqual({ n: "70000002", vs: "70000002" });
    expect((await manualOrder(pg)).rows[0]).toEqual({ n: "70000003", vs: null });
    expect((await eshopOrder(pg)).rows[0]).toEqual({ n: "70000004", vs: "70000004" });
    const { rows } = await pg.query<{ dup: number }>(
      `SELECT count(*)::int AS dup FROM orders a JOIN orders b ON a.id <> b.id
       AND (a.payment_vs = b.payment_vs OR a.order_number = b.order_number OR a.payment_vs::bigint = b.order_number)`
    );
    expect(rows[0].dup).toBe(0);
  });

  it("pojistky: číslo nejde změnit ani vložit jiné než VS / mimo řadu", async () => {
    await expect(pg.exec(`UPDATE orders SET order_number = 70000099 WHERE payment_vs = '70000001'`)).rejects.toThrow(/neměnný/);
    await expect(
      pg.exec(`INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status, payment_vs, order_number)
               VALUES ('eshop', 'x@example.cz', 1, 1, 'unpaid', ${VS}, 5209)`)
    ).rejects.toThrow(/orders_number_equals_vs/);
    await expect(
      pg.exec(`INSERT INTO orders (buyer_organization_id, subtotal_kc, total_kc, payment_status, order_number)
               VALUES ('${ORG}', 1, 1, 'unpaid', 5209)`)
    ).rejects.toThrow(/orders_number_range/);
  });

  it("druhé spuštění se zastaví a nic nezmění", async () => {
    await expect(pg.exec(file("31_cislovani_vs.sql"))).rejects.toThrow(/už je zapnuté/);
  });

  it("návrat: nové objednávky bez čísla (VS dál), přidělená čísla zůstanou; znovuzapnutí odmítne", async () => {
    await pg.exec(file("39_cislovani_vs_rollback.sql"));
    expect((await eshopOrder(pg)).rows[0]).toEqual({ n: null, vs: expect.stringMatching(/^7\d{7}$/) });
    const { rows } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM orders WHERE order_number IS NOT NULL`);
    expect(rows[0].n).toBe(4);
    await expect(pg.exec(file("31_cislovani_vs.sql"))).rejects.toThrow(/už číslo má/);
  });

  it("ruční objednávky vzniklé před zapnutím dostanou další čísla podle data", async () => {
    const db = await productionLikeDb();
    await manualOrder(db, "'2026-10-09'");
    await db.exec(file("31_cislovani_vs.sql"));
    const { rows } = await db.query(`SELECT channel, order_number::text AS n, payment_vs AS vs FROM orders WHERE order_number IS NOT NULL ORDER BY order_number`);
    expect(rows).toEqual([
      { channel: "eshop", n: "70000001", vs: "70000001" },
      { channel: "manual", n: "70000002", vs: null },
    ]);
    expect((await eshopOrder(db)).rows[0]).toEqual({ n: "70000003", vs: "70000003" });
  });

  it("na Preview (řada 900001+) se skript nespustí", async () => {
    const db = await productionLikeDb();
    await applyOrderNumbering(db, 900000);
    await expect(db.exec(file("31_cislovani_vs.sql"))).rejects.toThrow(/order_number_seq/);
  });
});

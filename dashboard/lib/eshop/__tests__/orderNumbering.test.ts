// ESHOP 1.0 — zapnutí číslování objednávek (docs/eshop-schema-draft/06b_*):
// přesně ten soubor, který se spouští na Neonu (Preview se startem 900000),
// nad PGlite se všemi migracemi a daty podobnými Preview.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyOrderNumbering, createMigratedDb, orderNumberingSql } from "./helpers/migratedDb";

const DB_TEST = { timeout: 60_000 };
const DOWN = readFileSync(path.join(__dirname, "../../../docs/eshop-schema-draft/06b_order_number_cutover_down.sql"), "utf8");
const ORG = "00000000-0000-4000-8000-000000000001";

async function seedLikePreview(pg: PGlite) {
  await pg.exec(`
    INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG}', '11935367', 'The Cup s.r.o.', 'Praha');
    INSERT INTO orders (id, channel, buyer_organization_id, subtotal_kc, total_kc, payment_status, ordered_at) VALUES
      ('00000000-0000-4000-8000-0000000000a1', 'import', '${ORG}', 758, 758, 'paid', '2026-09-01'),
      ('00000000-0000-4000-8000-0000000000a2', 'import', '${ORG}', 1137, 1137, 'paid', '2026-09-02');
    INSERT INTO orders (id, channel, contact_email, subtotal_kc, total_kc, payment_status, ordered_at) VALUES
      ('00000000-0000-4000-8000-0000000000b2', 'eshop', 'b@example.cz', 379, 379, 'unpaid', '2026-09-29'),
      ('00000000-0000-4000-8000-0000000000b1', 'eshop', 'a@example.cz', 2076, 2076, 'paid', '2026-09-28');
    INSERT INTO orders (id, buyer_organization_id, subtotal_kc, total_kc, payment_status, ordered_at) VALUES
      ('00000000-0000-4000-8000-0000000000c1', '${ORG}', 500, 500, 'unpaid', '2026-09-30');`);
}

const numbers = async (pg: PGlite) =>
  (await pg.query<{ id: string; channel: string; order_number: number | null }>(
    `SELECT right(id::text, 2) AS id, channel, order_number::int AS order_number FROM orders ORDER BY ordered_at, id`
  )).rows;

describe("číslování objednávek — skript 06b (Preview: start 900000)", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    ({ pg } = await createMigratedDb());
    await seedLikePreview(pg);
    await applyOrderNumbering(pg, 900000);
  }, DB_TEST.timeout);

  it("dosavadní objednávky dostanou čísla podle data objednání od 900001; import zůstane bez čísla", async () => {
    expect(await numbers(pg)).toEqual([
      { id: "a1", channel: "import", order_number: null },
      { id: "a2", channel: "import", order_number: null },
      { id: "b1", channel: "eshop", order_number: 900001 },
      { id: "b2", channel: "eshop", order_number: 900002 },
      { id: "c1", channel: "manual", order_number: 900003 },
    ]);
  });

  it("nová objednávka dostane další číslo automaticky (aplikace číslo neposílá)", async () => {
    const { rows } = await pg.query<{ n: number }>(
      `INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status) VALUES ('eshop', 'x@example.cz', 1, 1, 'unpaid') RETURNING order_number::int AS n`
    );
    expect(rows[0].n).toBe(900004);
  });

  it("souběžné objednávky: čísla jedinečná a souvislá", async () => {
    const inserted = await Promise.all(
      Array.from({ length: 20 }, () =>
        pg.query<{ n: number }>(
          `INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status) VALUES ('eshop', 'y@example.cz', 1, 1, 'unpaid') RETURNING order_number::int AS n`
        )
      )
    );
    const got = inserted.map((r) => r.rows[0].n).sort((a, b) => a - b);
    expect(new Set(got).size).toBe(20);
    expect(got[0]).toBe(900005);
    expect(got[19]).toBe(900024);
  });

  it("objednávka mimo import bez čísla neprojde; stejné číslo dvakrát taky ne", async () => {
    await expect(
      pg.exec(`INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status, order_number) VALUES ('eshop', 'z@example.cz', 1, 1, 'unpaid', NULL)`)
    ).rejects.toThrow(/orders_number_required/);
    await expect(
      pg.exec(`INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status, order_number) VALUES ('eshop', 'z@example.cz', 1, 1, 'unpaid', 900001)`)
    ).rejects.toThrow(/orders_order_number_key/);
  });

  it("druhé spuštění skriptu selže a nic nezmění", async () => {
    const before = await numbers(pg);
    await expect(applyOrderNumbering(pg, 900000)).rejects.toThrow();
    expect(await numbers(pg)).toEqual(before);
  });

  it("návrat (down): přestane přidělovat čísla, už přidělená zůstanou", async () => {
    await pg.exec(DOWN);
    const { rows } = await pg.query<{ n: number | null }>(
      `INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status) VALUES ('eshop', 'w@example.cz', 1, 1, 'unpaid') RETURNING order_number AS n`
    );
    expect(rows[0].n).toBeNull();
    expect((await numbers(pg)).find((r) => r.id === "b1")?.order_number).toBe(900001);
  });
});

describe("číslování — pojistky skriptu", DB_TEST, () => {
  it("bez doplněného startu řady skript skončí chybou (nic se nespustí)", async () => {
    const { pg } = await createMigratedDb();
    await expect(pg.exec(readFileSync(path.join(__dirname, "../../../docs/eshop-schema-draft/06b_order_number_cutover_up.sql"), "utf8"))).rejects.toThrow();
    const { rows } = await pg.query(`SELECT 1 FROM pg_class WHERE relname = 'order_number_seq'`);
    expect(rows).toHaveLength(0);
  });

  it("když už existuje vyšší číslo než start řady, skript se zastaví a nic nezmění", async () => {
    const { pg } = await createMigratedDb();
    await pg.exec(`INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status, order_number) VALUES ('eshop', 'q@example.cz', 1, 1, 'unpaid', 950000)`);
    await expect(pg.exec(orderNumberingSql(900000))).rejects.toThrow(/vyšší než zvolený start/);
    const { rows } = await pg.query(`SELECT 1 FROM pg_class WHERE relname = 'order_number_seq'`);
    expect(rows).toHaveLength(0);
  });
});

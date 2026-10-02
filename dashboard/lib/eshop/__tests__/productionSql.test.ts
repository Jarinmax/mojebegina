// ESHOP 1.0 — produkční SQL (docs/eshop-production/*) nad PGlite s daty
// jako v Production (ověřeno read-only 2. 10. 2026: migrace 0000–0012,
// 2 objednávky The Cup s 5 položkami, žádná historie). Ověřuje přesně ty
// soubory, které se budou spouštět v Neon SQL Editoru.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { migrationsSql, rollbackSql } from "../../../scripts/eshop-production/build-sql.mjs";

const DB_TEST = { timeout: 120_000 };
const DIR = path.join(__dirname, "../../../docs/eshop-production");
const file = (name: string) => readFileSync(path.join(DIR, name), "utf8");
const cutover = (start: number | string) => file("21_numbering_cutover.sql").replace("<START>", String(start));

const ORG = "11111111-1111-4111-8111-111111111111";
const THE_CUP = ["329f54d5-5a7d-4522-a21e-b7ad9cde24e2", "984e3645-1f2f-4444-8e8e-eeac75165a0a"];

/** Production k 2. 10. 2026: migrace do 0012 + 2 objednávky The Cup (5 položek). */
async function productionLikeDb(): Promise<PGlite> {
  const { pg } = await createMigratedDb("0012_phase_19_daily_calls");
  await pg.exec(`
    INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG}', '11935367', 'The Cup s.r.o.', 'Praha');
    INSERT INTO orders (id, buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at) VALUES
      ('${THE_CUP[0]}', '${ORG}', 758, 0, 758, 'paid', 'delivered', '2026-08-30'),
      ('${THE_CUP[1]}', '${ORG}', 1137, 0, 1137, 'paid', 'delivered', '2026-09-03');
    INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES
      ('${THE_CUP[0]}', 'Dýňová polévka', 1, 379, 379), ('${THE_CUP[0]}', 'Kulajda', 1, 379, 379),
      ('${THE_CUP[1]}', 'Dýňová polévka', 1, 379, 379), ('${THE_CUP[1]}', 'Kulajda', 1, 379, 379),
      ('${THE_CUP[1]}', 'Rajčatová polévka', 1, 379, 379);`);
  return pg;
}

async function check(pg: PGlite, name: string): Promise<string> {
  const sqlText = name.endsWith(".sql") ? file(name) : name;
  const { rows } = await pg.query<Record<string, unknown>>(sqlText.replace(/--[^\n]*\n/g, ""));
  return Object.values(rows[0]).map(String).join(" | ");
}

async function schema(pg: PGlite) {
  const { rows } = await pg.query(`
    SELECT 'col' AS kind, table_name AS t, column_name AS n, data_type || ':' || is_nullable || ':' || coalesce(column_default, '') AS d
      FROM information_schema.columns WHERE table_schema = 'public'
    UNION ALL SELECT 'con', table_name, constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = 'public'
    UNION ALL SELECT 'idx', tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
    ORDER BY 1, 2, 3`);
  return rows;
}

describe("produkční SQL — soubory odpovídají repozitáři", () => {
  it("11_migrations_0013_0019.sql = přesně drizzle 0013–0019; 19_migrations_rollback.sql = *_down.sql (vygenerováno)", () => {
    expect(file("11_migrations_0013_0019.sql")).toBe(migrationsSql());
    expect(file("19_migrations_rollback.sql")).toBe(rollbackSql());
  });
});

describe("produkční SQL — migrace 0013–0019 nad daty jako v Production", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await productionLikeDb();
  }, DB_TEST.timeout);

  it("kontrola před = hodnoty zjištěné read-only v Production", async () => {
    expect(await check(pg, "10_before_migrations.sql")).toBe("20 | 0 | 23 | 0 | 0 | 2 | 5 | 0 | 2 | 0 | 2");
  });

  it("migrace projdou a schéma je přesně jako na Preview (všechny migrace)", async () => {
    await pg.exec(file("11_migrations_0013_0019.sql"));
    const preview = (await createMigratedDb()).pg;
    expect(await schema(pg)).toEqual(await schema(preview));
  });

  it("kontrola po: katalog naplněný, The Cup = import, nic nečíslováno", async () => {
    expect(await check(pg, "12_after_migrations.sql")).toBe("24 | 4 | 5 | 7 | 11 | 4 | 2 | 2 | 0 | 5 | 0 | 0 | YES | 0");
  });

  it("chyba uprostřed migrací = nezmění se nic (jedna transakce)", async () => {
    const fresh = await productionLikeDb();
    const before = await schema(fresh);
    const broken = file("11_migrations_0013_0019.sql").replace(
      "-- ===== 0019_eshop_1_0_orders_guest.sql =====",
      "SELECT 1/0;\n-- ===== 0019_eshop_1_0_orders_guest.sql ====="
    );
    await expect(fresh.exec(broken)).rejects.toThrow(/division by zero/);
    await fresh.exec("ROLLBACK").catch(() => {});
    expect(await schema(fresh)).toEqual(before);
  });
});

describe("produkční SQL — zapnutí číslování (START 5200)", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await productionLikeDb();
    await pg.exec(file("11_migrations_0013_0019.sql"));
  }, DB_TEST.timeout);

  it("pojistky: chybějící START, START v řadě Preview nebo příliš malý → nic se nezmění", async () => {
    await expect(pg.exec(file("21_numbering_cutover.sql"))).rejects.toThrow();
    await expect(pg.exec(cutover(900000))).rejects.toThrow(/mimo rozsah/);
    await expect(pg.exec(cutover(950000))).rejects.toThrow(/mimo rozsah/);
    await expect(pg.exec(cutover(999))).rejects.toThrow(/mimo rozsah/);
    expect(await check(pg, "20_numbering_before.sql")).toBe("0 | 1 | 0 | 2 | 0 | 0 | 0");
  });

  it("zapnutí: The Cup (import) zůstane bez čísla; kontrola po sedí", async () => {
    await pg.exec(cutover(5200));
    expect(await check(pg, "22_numbering_after.sql")).toBe("1 | 1 | 1 | 2 | 0 | 5200 | 5201");
    const { rows } = await pg.query(`SELECT order_number FROM orders WHERE channel = 'import'`);
    expect(rows).toEqual([{ order_number: null }, { order_number: null }]);
  });

  it("nová produkční objednávka dostane číslo automaticky (5201, 5202…)", async () => {
    const insert = () =>
      pg.query<{ n: number }>(
        `INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status) VALUES ('eshop', 'jana@example.cz', 379, 379, 'unpaid') RETURNING order_number::int AS n`
      );
    expect((await insert()).rows[0].n).toBe(5201);
    expect((await insert()).rows[0].n).toBe(5202);
  });

  it("druhé spuštění se zastaví", async () => {
    await expect(pg.exec(cutover(5200))).rejects.toThrow(/už je zapnuté/);
  });

  it("návrat číslování: nová objednávka bez čísla, přidělená čísla zůstanou", async () => {
    await pg.exec(file("29_numbering_rollback.sql"));
    const { rows } = await pg.query(
      `INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status) VALUES ('eshop', 'x@example.cz', 1, 1, 'unpaid') RETURNING order_number`
    );
    expect(rows).toEqual([{ order_number: null }]);
    const kept = await pg.query(`SELECT count(*)::int AS n FROM orders WHERE order_number IN (5201, 5202)`);
    expect(kept.rows).toEqual([{ n: 2 }]);
  });

  it("ruční objednávky z doby mezi migrací a přepnutím dostanou čísla jako první (podle data)", async () => {
    const db = await productionLikeDb();
    await db.exec(file("11_migrations_0013_0019.sql"));
    await db.exec(`INSERT INTO orders (buyer_organization_id, subtotal_kc, total_kc, payment_status, ordered_at)
                   VALUES ('${ORG}', 500, 500, 'unpaid', '2026-10-05')`);
    await db.exec(cutover(5200));
    const { rows } = await db.query(`SELECT channel, order_number::int AS n FROM orders WHERE order_number IS NOT NULL`);
    expect(rows).toEqual([{ channel: "manual", n: 5201 }]);
  });
});

describe("produkční SQL — návrat migrací (jen před spuštěním e-shopu)", DB_TEST, () => {
  it("bez e-shopových dat: schéma i data jako před migracemi", async () => {
    const pg = await productionLikeDb();
    const before = await schema(pg);
    const data = (await pg.query(`SELECT id, total_kc FROM orders ORDER BY id`)).rows;
    await pg.exec(file("11_migrations_0013_0019.sql"));
    await pg.exec(file("19_migrations_rollback.sql"));
    expect(await schema(pg)).toEqual(before);
    expect((await pg.query(`SELECT id, total_kc FROM orders ORDER BY id`)).rows).toEqual(data);
  });

  it("existuje-li e-shopová objednávka, návrat selže a nic nezmění (data se neztratí)", async () => {
    const pg = await productionLikeDb();
    await pg.exec(file("11_migrations_0013_0019.sql"));
    await pg.exec(`INSERT INTO orders (channel, contact_email, subtotal_kc, total_kc, payment_status) VALUES ('eshop', 'jana@example.cz', 379, 379, 'unpaid')`);
    const before = await schema(pg);
    await expect(pg.exec(file("19_migrations_rollback.sql"))).rejects.toThrow();
    await pg.exec("ROLLBACK").catch(() => {});
    expect(await schema(pg)).toEqual(before);
  });
});

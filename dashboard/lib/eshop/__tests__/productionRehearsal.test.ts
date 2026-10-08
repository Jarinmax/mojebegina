// ESHOP 1.0 — GENERÁLKA produkčního postupu (ESHOP_PRODUCTION_ROLLOUT.md,
// Fáze A + číslování + krok B plateb) nad PGlite, jejíž schéma je PŘESNĚ
// jako Production DB:
//   • otisk schématu Production (sloupce + omezení + indexy, 391 objektů,
//     md5 8037d9ff647fb1f91b696f5d73986416) = otisk PGlite po migraci
//     0012 — ověřeno read-only 7. 10. 2026,
//   • data jako v Production (read-only 7. 10. 2026): 2 objednávky The Cup
//     (758 a 1137 Kč, paid / delivered, s organizací), 5 položek, 2 faktury
//     (paid, s číslem a datem, bez ID z iDokladu), žádná historie.
// Spouští PŘESNĚ ty soubory, které se budou vkládat do Neon SQL Editoru,
// ve stejném pořadí, a porovná každou kontrolu s hodnotou v dokumentaci.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";
import { PRODUCTION_MAIN, guardedIceCreamCategorySql, guardedMigrationsSql, guardedPaymentsBSql, guardedPhaseARestSql } from "../../../scripts/eshop-production/build-sql.mjs";

const ROOT = path.join(__dirname, "../../../docs");
const file = (dir: string, name: string) => readFileSync(path.join(ROOT, dir, name), "utf8");
const START = 5200; // jen pro generálku — skutečný START určí vedení

const ORG = "11111111-1111-4111-8111-111111111111";
const THE_CUP = ["329f54d5-5a7d-4522-a21e-b7ad9cde24e2", "984e3645-1f2f-4444-8e8e-eeac75165a0a"];

async function productionReplica(): Promise<PGlite> {
  const { pg } = await createMigratedDb("0012_phase_19_daily_calls");
  await pg.exec(`
    INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG}', '11935367', 'The Cup s.r.o.', 'Praha');
    INSERT INTO orders (id, buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at) VALUES
      ('${THE_CUP[0]}', '${ORG}', 758, 0, 758, 'paid', 'delivered', '2026-08-30'),
      ('${THE_CUP[1]}', '${ORG}', 1137, 0, 1137, 'paid', 'delivered', '2026-09-03');
    INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES
      ('${THE_CUP[0]}', 'Dýňová polévka', 1, 379, 379), ('${THE_CUP[0]}', 'Kulajda', 1, 379, 379),
      ('${THE_CUP[1]}', 'Dýňová polévka', 1, 379, 379), ('${THE_CUP[1]}', 'Kulajda', 1, 379, 379),
      ('${THE_CUP[1]}', 'Rajčatová polévka', 1, 379, 379);
    INSERT INTO invoices (order_id, organization_id, invoice_number, status, total_kc, issued_at) VALUES
      ('${THE_CUP[0]}', '${ORG}', '20260152', 'paid', 758, '2026-08-30'),
      ('${THE_CUP[1]}', '${ORG}', '20260153', 'paid', 1137, '2026-09-03');`);
  return pg;
}

/** Spustí kontrolní SELECT a vrátí řádek jako „a | b | c“ (jako Neon SQL Editor). */
async function check(pg: PGlite, sqlText: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(sqlText.replace(/--[^\n]*\n/g, "\n"));
  return Object.values(rows[0]).map((v) => (v === null ? "NULL" : String(v))).join(" | ");
}

/** Spustí celý soubor najednou (jako „Run“ v Neon SQL Editoru). */
async function run(pg: PGlite, sqlText: string) {
  await pg.exec(sqlText);
}

describe("generálka produkčního postupu nad kopií Production", { timeout: 180_000 }, () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await productionReplica();
  }, 180_000);

  it("A2 — kontrola před migracemi = hodnota naměřená v Production 7. 10. 2026", async () => {
    expect(await check(pg, file("eshop-production", "10_before_migrations.sql"))).toBe("20 | 0 | 23 | 0 | 0 | 2 | 5 | 0 | 2 | 0 | 2");
  });

  it("A3–A4 — migrace 0013–0019 S POJISTKOU (soubor pro Production main) → kontrola po", async () => {
    // jako Neon na větvi main
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN.timelineId}'`);
    await run(pg, file("eshop-production", "11_migrations_0013_0019_MAIN.sql"));
    expect(await check(pg, file("eshop-production", "12_after_migrations.sql"))).toBe(
      "24 | 4 | 5 | 7 | 11 | 4 | 2 | 2 | 0 | 5 | 0 | 0 | YES | 0"
    );
  });

  it("A6 — katalog Bylinné sirupy (před / skript / po)", async () => {
    expect(await check(pg, file("eshop-catalog", "30_sirupy_before.sql"))).toBe("1 | 0 | 0 | 0 | 0 | 7 | 11");
    await run(pg, file("eshop-catalog", "31_sirupy.sql"));
    expect(await check(pg, file("eshop-catalog", "32_sirupy_after.sql"))).toBe("3 | 7 | 7 | 14 | 7 | 7 | 3 | 4 | 14 | 25");
  });

  it("A7 — katalog Čerstvé polévky (před / skript / po)", async () => {
    expect(await check(pg, file("eshop-catalog", "40_polevky_before.sql"))).toBe(
      "3 | 0 | Krémová polévka z dýně. | (bez názvu) | 379 | 0"
    );
    await run(pg, file("eshop-catalog", "41_polevky.sql"));
    expect(await check(pg, file("eshop-catalog", "42_polevky_after.sql"))).toBe(
      "6 | 1 | ano | 3 l Rodinná zásoba (bag-in-box) | 379 | 12 | 6 | 1 | 379 Kč, 12 porcí | 379 Kč, 12 porcí"
    );
  });

  it("A8 — katalog Čaje (před / skript / po)", async () => {
    expect(await check(pg, file("eshop-catalog", "50_caje_before.sql"))).toBe("1 | 0 | 0 | 17");
    await run(pg, file("eshop-catalog", "51_caje.sql"));
    expect(await check(pg, file("eshop-catalog", "52_caje_after.sql"))).toBe(
      "8 | 1 | 3 l Rodinná zásoba (bag-in-box), 289 Kč | 8 | 249 Kč, 12 nápojů"
    );
  });

  it("A9 — platby a fakturace, krok A (před / migrace / po); faktury The Cup = import, vystavené", async () => {
    // Production: 2 faktury, 2 objednávky, 0 e-shopových
    expect(await check(pg, file("eshop-payments", "10_before.sql"))).toBe("0 | 0 | 1 | 2 | 2 | 0");
    await run(pg, file("eshop-payments", "11_migration.sql"));
    expect(await check(pg, file("eshop-payments", "12_after.sql"))).toBe("5 | 1 | 1 | 1 | 0 | 2 | 2 | 2 | 0 | 0 | 2");
    const { rows } = await pg.query(`SELECT origin, doc_state, document_type, invoice_number FROM invoices ORDER BY invoice_number`);
    expect(rows).toEqual([
      { origin: "import", doc_state: "issued", document_type: "invoice", invoice_number: "20260152" },
      { origin: "import", doc_state: "issued", document_type: "invoice", invoice_number: "20260153" },
    ]);
  });

  it("C5 — zapnutí číslování (před / START / po)", async () => {
    expect(await check(pg, file("eshop-production", "20_numbering_before.sql"))).toBe("0 | 1 | 0 | 2 | 0 | 0 | 0");
    await run(pg, file("eshop-production", "21_numbering_cutover.sql").replace("<START>", String(START)));
    expect(await check(pg, file("eshop-production", "22_numbering_after.sql"))).toBe(`1 | 1 | 1 | 2 | 0 | ${START} | ${START + 1}`);
  });

  it("krok B plateb — po nasazení kódu a jedné e-shopové objednávce (před / migrace / po)", async () => {
    // e-shopová objednávka tak, jak ji zapíše nový kód (lib/eshop/orderWrite.ts: VS z řady)
    await pg.exec(`
      INSERT INTO orders (channel, contact_email, contact_name, subtotal_kc, shipping_kc, total_kc, payment_status, payment_vs)
      VALUES ('eshop', 'test@begina.cz', 'Test', 249, 0, 249, 'unpaid', '7' || lpad(nextval('payment_vs_seq')::text, 7, '0'))`);
    const { rows } = await pg.query<{ order_number: number; payment_vs: string }>(
      `SELECT order_number, payment_vs FROM orders WHERE channel = 'eshop'`
    );
    expect(rows).toEqual([{ order_number: START + 1, payment_vs: "70000001" }]);
    expect(await check(pg, file("eshop-payments", "20_before.sql"))).toBe("ano | 0 | 1 | 0 | 70000001");
    await run(pg, file("eshop-payments", "21_migration.sql"));
    expect(await check(pg, file("eshop-payments", "22_after.sql"))).toBe("1 | 1 | 0 | ano | ano");
  });

  it("výsledné schéma = schéma kódu na větvi (migrace 0000–0020) + pojistka číslování", async () => {
    const schema = async (db: PGlite) =>
      (
        await db.query(`
          SELECT 'col' AS kind, table_name AS t, column_name AS n, data_type || ':' || is_nullable AS d
            FROM information_schema.columns WHERE table_schema = 'public'
          UNION ALL SELECT 'con', table_name, constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = 'public'
          UNION ALL SELECT 'idx', tablename, indexname, '' FROM pg_indexes WHERE schemaname = 'public'
          ORDER BY 1, 2, 3`)
      ).rows;
    const { pg: reference } = await createMigratedDb();
    const key = (r: unknown) => JSON.stringify(r);
    const a = new Set((await schema(pg)).map(key));
    const b = new Set((await schema(reference)).map(key));
    const onlyProduction = [...a].filter((x) => !b.has(x));
    const onlyCode = [...b].filter((x) => !a.has(x));
    // Jediný rozdíl: pojistka orders_number_required ze zapnutí číslování
    // (21_numbering_cutover.sql / 06b) — mimo drizzle migrace, stejně jako
    // na Preview, kde nový kód běží.
    expect({ onlyProduction, onlyCode }).toEqual({
      onlyProduction: [key({ kind: "con", t: "orders", n: "orders_number_required", d: "CHECK" })],
      onlyCode: [],
    });
  });
});

describe("varianta pořadí: první testovací objednávka PŘED zapnutím číslování", { timeout: 180_000 }, () => {
  it("objednávka bez čísla projde; zapnutí číslování jí pak číslo přidělí jako první", async () => {
    const pg = await productionReplica();
    await run(pg, file("eshop-production", "11_migrations_0013_0019.sql"));
    await run(pg, file("eshop-payments", "11_migration.sql"));
    await pg.exec(`
      INSERT INTO orders (channel, contact_email, contact_name, subtotal_kc, shipping_kc, total_kc, payment_status, payment_vs)
      VALUES ('eshop', 'test@begina.cz', 'Test', 249, 0, 249, 'unpaid', '7' || lpad(nextval('payment_vs_seq')::text, 7, '0'))`);
    const before = await pg.query<{ order_number: number | null }>(`SELECT order_number FROM orders WHERE channel = 'eshop'`);
    expect(before.rows).toEqual([{ order_number: null }]);
    // kontrola před číslováním vidí jednu nečíslovanou ne-importovanou objednávku
    expect(await check(pg, file("eshop-production", "20_numbering_before.sql"))).toBe("0 | 1 | 0 | 2 | 1 | 0 | 0");
    await run(pg, file("eshop-production", "21_numbering_cutover.sql").replace("<START>", String(START)));
    const after = await pg.query<{ order_number: number }>(`SELECT order_number FROM orders WHERE channel = 'eshop'`);
    expect(after.rows).toEqual([{ order_number: START + 1 }]);
  });
});

describe("pojistka 11_migrations_0013_0019_MAIN.sql — jen Production main, jen jednou", { timeout: 180_000 }, () => {
  const tables = async (pg: PGlite) =>
    (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`)).rows[0].n;

  it("soubor = výstup generátoru (nikdo ho neupravil ručně)", () => {
    expect(file("eshop-production", "11_migrations_0013_0019_MAIN.sql")).toBe(guardedMigrationsSql());
  });

  for (const [label, setup] of [
    ["jiná větev (např. backup) — jiný neon.timeline_id", `SET neon.timeline_id = '00000000000000000000000000000000'`],
    ["mimo Neon / bez timeline", ""],
  ] as const) {
    it(`${label} → STOP, nic se nezmění`, async () => {
      const pg = await productionReplica();
      if (setup) await pg.exec(setup);
      await expect(run(pg, file("eshop-production", "11_migrations_0013_0019_MAIN.sql"))).rejects.toThrow(/NENÍ Production větev main/);
      await pg.exec("ROLLBACK");
      expect(await tables(pg)).toBe(20);
      expect(await check(pg, file("eshop-production", "10_before_migrations.sql"))).toBe("20 | 0 | 23 | 0 | 0 | 2 | 5 | 0 | 2 | 0 | 2");
    });
  }

  it("druhé spuštění na main → STOP „už běžela“, nic se nezmění", async () => {
    const pg = await productionReplica();
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN.timelineId}'`);
    await run(pg, file("eshop-production", "11_migrations_0013_0019_MAIN.sql"));
    const after = await check(pg, file("eshop-production", "12_after_migrations.sql"));
    await expect(run(pg, file("eshop-production", "11_migrations_0013_0019_MAIN.sql"))).rejects.toThrow(/není ve stavu před migracemi/);
    await pg.exec("ROLLBACK");
    expect(await check(pg, file("eshop-production", "12_after_migrations.sql"))).toBe(after);
  });

  it("chráněná i původní verze dají stejné schéma a data", async () => {
    const a = await productionReplica();
    await a.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN.timelineId}'`);
    await run(a, file("eshop-production", "11_migrations_0013_0019_MAIN.sql"));
    const b = await productionReplica();
    await run(b, file("eshop-production", "11_migrations_0013_0019.sql"));
    const dump = async (db: PGlite) => [
      await check(db, file("eshop-production", "12_after_migrations.sql")),
      (await db.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`)).rows,
      (await db.query(`SELECT slug FROM products ORDER BY slug`)).rows,
    ];
    expect(await dump(a)).toEqual(await dump(b));
  });
});

describe("13_katalog_a_platby_A_MAIN.sql — zbytek fáze A v jedné transakci, jen main", { timeout: 240_000 }, () => {
  const REST = "13_katalog_a_platby_A_MAIN.sql";
  async function afterMigrations(timeline: string | null = PRODUCTION_MAIN.timelineId) {
    const pg = await productionReplica();
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN.timelineId}'`);
    await run(pg, file("eshop-production", "11_migrations_0013_0019_MAIN.sql"));
    if (timeline !== PRODUCTION_MAIN.timelineId) await pg.exec(`SET neon.timeline_id = '${timeline ?? ""}'`);
    return pg;
  }
  const afterChecks = async (pg: PGlite) => [
    await check(pg, file("eshop-catalog", "32_sirupy_after.sql")),
    await check(pg, file("eshop-catalog", "42_polevky_after.sql")),
    await check(pg, file("eshop-catalog", "52_caje_after.sql")),
    await check(pg, file("eshop-payments", "12_after.sql")),
  ];

  it("soubor = výstup generátoru", () => {
    expect(file("eshop-production", REST)).toBe(guardedPhaseARestSql());
  });

  it("na main po migracích: všechny kontroly po = hodnoty v dokumentaci; stejné jako 4 skripty zvlášť", async () => {
    const pg = await afterMigrations();
    await run(pg, file("eshop-production", REST));
    expect(await afterChecks(pg)).toEqual([
      "3 | 7 | 7 | 14 | 7 | 7 | 3 | 4 | 25 | 36", // celkem až po polévkách a čajích
      "6 | 1 | ano | 3 l Rodinná zásoba (bag-in-box) | 379 | 12 | 6 | 1 | 379 Kč, 12 porcí | 379 Kč, 12 porcí",
      "8 | 1 | 3 l Rodinná zásoba (bag-in-box), 289 Kč | 8 | 249 Kč, 12 nápojů",
      "5 | 1 | 1 | 1 | 0 | 2 | 2 | 2 | 0 | 0 | 2",
    ]);
    const separate = await afterMigrations();
    for (const [dir, name] of [
      ["eshop-catalog", "31_sirupy.sql"],
      ["eshop-catalog", "41_polevky.sql"],
      ["eshop-catalog", "51_caje.sql"],
      ["eshop-payments", "11_migration.sql"],
    ]) {
      await run(separate, file(dir, name));
    }
    const dump = async (db: PGlite) => [
      (await db.query(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`)).rows,
      (await db.query(`SELECT slug, name, is_active FROM products ORDER BY slug`)).rows,
      (await db.query(`SELECT sku, price_b2c_kc, is_active FROM product_variants ORDER BY sku`)).rows,
      (await db.query(`SELECT slug, intro FROM product_categories ORDER BY slug`)).rows,
      (await db.query(`SELECT origin, doc_state, invoice_number FROM invoices ORDER BY invoice_number`)).rows,
    ];
    expect(await dump(pg)).toEqual(await dump(separate));
  });

  it("jiná větev (backup) → STOP, nic se nezmění", async () => {
    const pg = await afterMigrations("c57cebc6ddf2b187ed1fcdd53c402b60");
    const before = await check(pg, file("eshop-production", "12_after_migrations.sql"));
    await expect(run(pg, file("eshop-production", REST))).rejects.toThrow(/NENÍ Production větev main/);
    await pg.exec("ROLLBACK");
    expect(await check(pg, file("eshop-production", "12_after_migrations.sql"))).toBe(before);
  });

  it("před migracemi 0013–0019 → STOP", async () => {
    const pg = await productionReplica();
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN.timelineId}'`);
    await expect(run(pg, file("eshop-production", REST))).rejects.toThrow(/chybí migrace 0013–0019/);
    await pg.exec("ROLLBACK");
    expect(await check(pg, file("eshop-production", "10_before_migrations.sql"))).toBe("20 | 0 | 23 | 0 | 0 | 2 | 5 | 0 | 2 | 0 | 2");
  });

  it("druhé spuštění → STOP „už běžely“, nic se nezmění", async () => {
    const pg = await afterMigrations();
    await run(pg, file("eshop-production", REST));
    const done = await afterChecks(pg);
    await expect(run(pg, file("eshop-production", REST))).rejects.toThrow(/už běžely/);
    await pg.exec("ROLLBACK");
    expect(await afterChecks(pg)).toEqual(done);
  });
});

describe("15_platby_B_MAIN.sql — povinný VS PŘED první e-shopovou objednávkou, jen main", { timeout: 240_000 }, () => {
  const B = "15_platby_B_MAIN.sql";
  const ESHOP_ORDER = (vs: string) => `
    INSERT INTO orders (channel, contact_email, contact_name, subtotal_kc, shipping_kc, total_kc, payment_status, payment_vs)
    VALUES ('eshop', 'jaroslav@begina.cz', 'Jaroslav Viner', 129, 99, 228, 'unpaid', ${vs})`;
  const NEXT_VS = `'7' || lpad(nextval('payment_vs_seq')::text, 7, '0')`;
  const theCup = async (pg: PGlite) =>
    (await pg.query(`SELECT id, total_kc, payment_status, fulfillment_status, payment_vs, channel FROM orders ORDER BY id`)).rows;
  /** Stav Production 7. 10. 2026 po fázi A (oba soubory MAIN). */
  async function afterPhaseA(timeline: string | null = PRODUCTION_MAIN.timelineId) {
    const pg = await productionReplica();
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN.timelineId}'`);
    await run(pg, file("eshop-production", "11_migrations_0013_0019_MAIN.sql"));
    await run(pg, file("eshop-production", "13_katalog_a_platby_A_MAIN.sql"));
    if (timeline !== PRODUCTION_MAIN.timelineId) await pg.exec(`SET neon.timeline_id = '${timeline ?? ""}'`);
    return pg;
  }

  it("soubor = výstup generátoru; obsahuje 21_migration.sql beze změny kódu", () => {
    const sqlText = file("eshop-production", B);
    expect(sqlText).toBe(guardedPaymentsBSql());
    expect(sqlText).toContain("ADD CONSTRAINT orders_eshop_requires_vs\n  CHECK (channel <> 'eshop' OR payment_vs IS NOT NULL);");
    expect(sqlText.match(/^(BEGIN|COMMIT);$/gm)).toEqual(["BEGIN;", "COMMIT;"]);
  });

  it("na main po fázi A: před / migrace / po; The Cup beze změny; pak objednávka bez VS neprojde, s VS ano (70000001)", async () => {
    const pg = await afterPhaseA();
    expect(await check(pg, file("eshop-payments", "20_before.sql"))).toBe("ano | 0 | 0 | 0 | NULL");
    const cup = await theCup(pg);
    await run(pg, file("eshop-production", B));
    expect(await check(pg, file("eshop-payments", "22_after.sql"))).toBe("1 | 0 | 0 | ano | ano");
    expect(await theCup(pg)).toEqual(cup);
    await expect(pg.exec(ESHOP_ORDER("NULL"))).rejects.toThrow(/orders_eshop_requires_vs/);
    await pg.exec(ESHOP_ORDER(NEXT_VS));
    const { rows } = await pg.query(`SELECT order_number, payment_vs FROM orders WHERE channel = 'eshop'`);
    expect(rows).toEqual([{ order_number: null, payment_vs: "70000001" }]);
    expect(await check(pg, file("eshop-payments", "22_after.sql"))).toBe("1 | 1 | 0 | ano | ano");
    // vrácení vypne jen povinnost, VS zůstává
    await run(pg, file("eshop-payments", "29_rollback.sql"));
    expect(await check(pg, file("eshop-payments", "22_after.sql"))).toBe("0 | 1 | 0 | ano | ano");
  });

  it("jiná větev (backup) → STOP, nic se nezmění", async () => {
    const pg = await afterPhaseA("c57cebc6ddf2b187ed1fcdd53c402b60");
    await expect(run(pg, file("eshop-production", B))).rejects.toThrow(/NENÍ Production větev main/);
    await pg.exec("ROLLBACK");
    expect(await check(pg, file("eshop-payments", "20_before.sql"))).toBe("ano | 0 | 0 | 0 | NULL");
  });

  it("bez kroku A → STOP", async () => {
    const pg = await productionReplica();
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN.timelineId}'`);
    await run(pg, file("eshop-production", "11_migrations_0013_0019_MAIN.sql"));
    await expect(run(pg, file("eshop-production", B))).rejects.toThrow(/chybí platby krok A/);
    await pg.exec("ROLLBACK");
  });

  it("druhé spuštění → STOP „už běžel“", async () => {
    const pg = await afterPhaseA();
    await run(pg, file("eshop-production", B));
    await expect(run(pg, file("eshop-production", B))).rejects.toThrow(/krok B už běžel/);
    await pg.exec("ROLLBACK");
    expect(await check(pg, file("eshop-payments", "22_after.sql"))).toBe("1 | 0 | 0 | ano | ano");
  });

  it("už existuje e-shopová objednávka → STOP, nic se nezmění", async () => {
    const pg = await afterPhaseA();
    await pg.exec(ESHOP_ORDER(NEXT_VS));
    await expect(run(pg, file("eshop-production", B))).rejects.toThrow(/už je e-shopová objednávka/);
    await pg.exec("ROLLBACK");
    expect(await check(pg, file("eshop-payments", "20_before.sql"))).toBe("ano | 0 | 1 | 0 | 70000001");
  });
});

describe("17_kategorie_zmrzliny_MAIN.sql — kategorie Zmrzliny (8. 10. 2026), jen main", { timeout: 240_000 }, () => {
  const Z = "17_kategorie_zmrzliny_MAIN.sql";
  async function afterB(timeline: string | null = PRODUCTION_MAIN.timelineId) {
    const pg = await productionReplica();
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN.timelineId}'`);
    for (const f of ["11_migrations_0013_0019_MAIN.sql", "13_katalog_a_platby_A_MAIN.sql", "15_platby_B_MAIN.sql"]) {
      await run(pg, file("eshop-production", f));
    }
    if (timeline !== PRODUCTION_MAIN.timelineId) await pg.exec(`SET neon.timeline_id = '${timeline ?? ""}'`);
    return pg;
  }
  const products = async (pg: PGlite) => (await pg.query(`SELECT slug, category_id, is_active FROM products ORDER BY slug`)).rows;

  it("soubor = výstup generátoru", () => {
    expect(file("eshop-production", Z)).toBe(guardedIceCreamCategorySql());
  });

  it("na main: před / skript / po; produkty beze změny; Preview verze dá totéž a je opakovatelná", async () => {
    const pg = await afterB();
    expect(await check(pg, file("eshop-catalog", "60_zmrzliny_before.sql"))).toBe("0 | 50 | 5");
    const before = await products(pg);
    await run(pg, file("eshop-production", Z));
    expect(await check(pg, file("eshop-catalog", "62_zmrzliny_after.sql"))).toBe("1 | Zmrzliny | 60 | ano | 0 | 6 | ano");
    expect(await products(pg)).toEqual(before);
    const preview = await afterB();
    await run(preview, file("eshop-catalog", "61_zmrzliny.sql"));
    await run(preview, file("eshop-catalog", "61_zmrzliny.sql"));
    expect(await check(preview, file("eshop-catalog", "62_zmrzliny_after.sql"))).toBe("1 | Zmrzliny | 60 | ano | 0 | 6 | ano");
    await run(preview, file("eshop-catalog", "69_zmrzliny_rollback.sql"));
    expect(await check(preview, file("eshop-catalog", "62_zmrzliny_after.sql"))).toBe("1 | Zmrzliny | 60 | ne | 0 | 6 | ano");
  });

  it("jiná větev → STOP; podruhé → STOP; nic se nezmění", async () => {
    const other = await afterB("c57cebc6ddf2b187ed1fcdd53c402b60");
    await expect(run(other, file("eshop-production", Z))).rejects.toThrow(/NENÍ Production větev main/);
    await other.exec("ROLLBACK");
    expect(await check(other, file("eshop-catalog", "60_zmrzliny_before.sql"))).toBe("0 | 50 | 5");
    const pg = await afterB();
    await run(pg, file("eshop-production", Z));
    await expect(run(pg, file("eshop-production", Z))).rejects.toThrow(/Zmrzliny už existuje/);
    await pg.exec("ROLLBACK");
    expect(await check(pg, file("eshop-catalog", "62_zmrzliny_after.sql"))).toBe("1 | Zmrzliny | 60 | ano | 0 | 6 | ano");
  });
});

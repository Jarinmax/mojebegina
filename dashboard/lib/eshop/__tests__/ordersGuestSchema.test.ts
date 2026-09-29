// ESHOP 1.0, kroky 6a + 7 (migrace 0017, 0018): číslo objednávky (zatím
// bez řady) a objednávka bez organizace. PGlite se stejnými migracemi jako
// Neon a daty jako v Preview/produkci. Nikdy se nepřipojuje k Neonu.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigration, createMigratedDb, migrationTags } from "./helpers/migratedDb";

const DB_TEST = { timeout: 30_000 };
const BEFORE = "0016_eshop_1_0_order_items_variant";
const STEPS = ["0017_eshop_1_0_order_number", "0018_eshop_1_0_orders_guest"];
const ORG = "00000000-0000-4000-8000-000000000001";
const THE_CUP = ["329f54d5-5a7d-4522-a21e-b7ad9cde24e2", "984e3645-1f2f-4444-8e8e-eeac75165a0a"];

async function dbBeforeSteps() {
  const migrated = await createMigratedDb(BEFORE);
  await migrated.pg.exec(`
    INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG}', '11935367', 'The Cup s.r.o.', 'Praha');
    INSERT INTO orders (id, buyer_organization_id, channel, subtotal_kc, total_kc, payment_status, fulfillment_status)
    VALUES ('${THE_CUP[0]}', '${ORG}', 'import', 758, 758, 'paid', 'delivered'),
           ('${THE_CUP[1]}', '${ORG}', 'import', 1137, 1137, 'paid', 'delivered');
    INSERT INTO orders (id, buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status)
    VALUES ('00000000-0000-4000-8000-0000000000f1', '${ORG}', 379, 198, 577, 'invoiced');`);
  return migrated;
}

async function applySteps(pg: PGlite) {
  for (const step of STEPS) await applyMigration(pg, step);
}

async function ordersSchema(pg: PGlite) {
  const { rows } = await pg.query(`
    SELECT 'col' AS kind, column_name AS name, data_type || ':' || is_nullable || ':' || coalesce(column_default, '') AS detail
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders'
    UNION ALL
    SELECT 'con', constraint_name, constraint_type FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'orders'
    UNION ALL
    SELECT 'idx', indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'orders'
    ORDER BY 1, 2`);
  return rows;
}

async function otherTablesSchema(pg: PGlite) {
  const { rows } = await pg.query(`
    SELECT table_name, column_name, data_type || ':' || is_nullable || ':' || coalesce(column_default, '') AS detail
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'orders'
    UNION ALL
    SELECT tc.table_name, tc.constraint_name, tc.constraint_type FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' AND tc.table_name <> 'orders'
    ORDER BY 1, 2`);
  return rows;
}

const guestInsert = (cols: string, vals: string) =>
  `INSERT INTO orders (payment_status, subtotal_kc, total_kc, ${cols}) VALUES ('unpaid', 379, 379, ${vals})`;

describe("kroky 6a + 7 — migrace 0017 a 0018", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    ({ pg } = await dbBeforeSteps());
    await applySteps(pg);
  }, DB_TEST.timeout);

  it("jsou v journalu hned po krocích 3–5", () => {
    const start = migrationTags.indexOf(BEFORE) + 1;
    expect(migrationTags.slice(start, start + STEPS.length)).toEqual(STEPS);
  });

  it("existující objednávky: bez čísla, organizace i částky beze změny", async () => {
    const { rows } = await pg.query(
      `SELECT count(*)::int AS n, count(order_number)::int AS cisla, count(buyer_organization_id)::int AS s_organizaci,
              sum(total_kc)::int AS celkem FROM orders`
    );
    expect(rows[0]).toEqual({ n: 3, cisla: 0, s_organizaci: 3, celkem: 758 + 1137 + 577 });
  });

  it("číslování se NEZAPNULO: žádná řada, nová objednávka dostane NULL", async () => {
    const seq = await pg.query(`SELECT count(*)::int AS n FROM pg_class WHERE relkind = 'S' AND relname LIKE '%order_number%'`);
    expect(seq.rows[0]).toEqual({ n: 0 });
    await pg.exec(`INSERT INTO orders (buyer_organization_id, subtotal_kc, total_kc, payment_status)
                   VALUES ('${ORG}', 1, 1, 'unpaid')`);
    const { rows } = await pg.query(`SELECT order_number FROM orders WHERE total_kc = 1`);
    expect(rows).toEqual([{ order_number: null }]);
  });

  it("číslo objednávky je jedinečné (víc objednávek bez čísla je v pořádku)", async () => {
    await pg.exec(`UPDATE orders SET order_number = 5094 WHERE id = '${THE_CUP[0]}'`);
    await expect(pg.exec(`UPDATE orders SET order_number = 5094 WHERE id = '${THE_CUP[1]}'`)).rejects.toThrow(
      /orders_order_number_key/
    );
    await pg.exec(`UPDATE orders SET order_number = NULL WHERE id = '${THE_CUP[0]}'`);
  });

  it("e-shopová objednávka soukromého zákazníka bez organizace projde s e-mailem", async () => {
    await pg.exec(guestInsert("channel, contact_name, contact_email", "'eshop', 'Jana N.', 'jana@example.cz'"));
    const { rows } = await pg.query(`SELECT buyer_organization_id, channel FROM orders WHERE contact_email = 'jana@example.cz'`);
    expect(rows).toEqual([{ buyer_organization_id: null, channel: "eshop" }]);
  });

  it("databáze odmítne ruční objednávku bez organizace a objednávku bez organizace i e-mailu", async () => {
    await expect(pg.exec(guestInsert("contact_email", "'x@example.cz'"))).rejects.toThrow(/orders_manual_requires_org/);
    await expect(pg.exec(guestInsert("channel, contact_name", "'eshop', 'Anonym'"))).rejects.toThrow(
      /orders_guest_requires_contact/
    );
  });

  it("ostatní tabulky (položky, historie, CRM, uživatelé, katalog…) mají stejné schéma jako před 0017", async () => {
    const before = await createMigratedDb(BEFORE);
    expect(await otherTablesSchema(pg)).toEqual(await otherTablesSchema(before.pg));
  });
});

describe("kroky 6a + 7 jsou vratné (docs/eshop-schema-draft/*_down.sql)", DB_TEST, () => {
  const draftDir = path.join(__dirname, "../../../docs/eshop-schema-draft");
  const down = (file: string) => readFileSync(path.join(draftDir, file), "utf8");

  it("návrat 07 → 06a vrátí schéma i data objednávek přesně", async () => {
    const reference = await dbBeforeSteps();
    const { pg } = await dbBeforeSteps();
    await applySteps(pg);
    await pg.exec(down("07_orders_guest_down.sql"));
    await pg.exec(down("06a_order_number_column_down.sql"));
    expect(await ordersSchema(pg)).toEqual(await ordersSchema(reference.pg));
    const data = `SELECT id, buyer_organization_id, channel, total_kc FROM orders ORDER BY id`;
    expect((await pg.query(data)).rows).toEqual((await reference.pg.query(data)).rows);
  });

  it("návrat kroku 7 selže, jakmile existuje objednávka bez organizace (data se nezahodí)", async () => {
    const { pg } = await dbBeforeSteps();
    await applySteps(pg);
    await pg.exec(guestInsert("channel, contact_email", "'eshop', 'jana@example.cz'"));
    await expect(pg.exec(down("07_orders_guest_down.sql"))).rejects.toThrow(/buyer_organization_id/);
  });
});

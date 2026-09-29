// ESHOP 1.0, kroky 3–5 (migrace 0014–0016): systémový záznam v historii
// objednávky, nová pole `orders`, vazba `order_items` na balení. Vše na
// PGlite se stejnými migracemi, které se spouštějí na Neonu.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigration, createMigratedDb, migrationTags } from "./helpers/migratedDb";

const DB_TEST = { timeout: 30_000 };
const SEED = "0013_eshop_1_0_products_seed";
const STEPS = [
  "0014_eshop_1_0_order_activity_actor",
  "0015_eshop_1_0_orders_fields",
  "0016_eshop_1_0_order_items_variant",
];
const ORDER_TABLES = ["orders", "order_items", "order_activity"];

// Dvě importované objednávky The Cup (stejná id jako v produkci) + 5 položek.
const THE_CUP = ["329f54d5-5a7d-4522-a21e-b7ad9cde24e2", "984e3645-1f2f-4444-8e8e-eeac75165a0a"];
const ORG = "00000000-0000-4000-8000-000000000001";

async function insertProductionLikeData(pg: PGlite) {
  await pg.exec(`
    INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG}', '12345678', 'The Cup', 'Praha');
    INSERT INTO orders (id, buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status)
    VALUES ('${THE_CUP[0]}', '${ORG}', 1137, 0, 1137, 'paid', 'delivered'),
           ('${THE_CUP[1]}', '${ORG}', 758, 0, 758, 'paid', 'delivered');
    INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc)
    VALUES ('${THE_CUP[0]}', 'Kulajda', 1, 379, 379), ('${THE_CUP[0]}', 'Dýňová polévka', 1, 379, 379),
           ('${THE_CUP[0]}', 'Rajčatová polévka', 1, 379, 379),
           ('${THE_CUP[1]}', 'Kulajda', 1, 379, 379), ('${THE_CUP[1]}', 'Rajčatová polévka', 1, 379, 379);`);
}

async function dbBeforeSteps() {
  const migrated = await createMigratedDb(SEED);
  await insertProductionLikeData(migrated.pg);
  return migrated;
}

async function applySteps(pg: PGlite) {
  for (const step of STEPS) await applyMigration(pg, step);
}

// Sloupce a omezení vybraných tabulek (nebo všech kromě nich).
async function schemaSnapshot(pg: PGlite, { only, except }: { only?: string[]; except?: string[] }) {
  const filter = only
    ? `IN (${only.map((t) => `'${t}'`).join(", ")})`
    : `NOT IN (${(except ?? []).map((t) => `'${t}'`).join(", ")})`;
  const { rows } = await pg.query(`
    SELECT 'col' AS kind, table_name, column_name AS name, data_type || ':' || is_nullable || ':' || coalesce(column_default, '') AS detail
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name ${filter}
    UNION ALL
    SELECT 'con', tc.table_name, tc.constraint_name, tc.constraint_type
    FROM information_schema.table_constraints tc WHERE tc.table_schema = 'public' AND tc.table_name ${filter}
    UNION ALL
    SELECT 'idx', tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename ${filter}
    ORDER BY 1, 2, 3`);
  return rows;
}

async function variantId(pg: PGlite, sku: string): Promise<string> {
  const { rows } = await pg.query<{ id: string }>(`SELECT id FROM product_variants WHERE sku = '${sku}'`);
  return rows[0].id;
}

describe("kroky 3–5 — pořadí a dopad na existující data", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    ({ pg } = await dbBeforeSteps());
    await applySteps(pg);
  }, DB_TEST.timeout);

  it("migrace 0014–0016 jsou v journalu hned po Produktech 1.0", () => {
    const start = migrationTags.indexOf(SEED) + 1;
    expect(migrationTags.slice(start, start + STEPS.length)).toEqual(STEPS);
  });

  it("importované objednávky The Cup dostanou channel 'import', součty a položky beze změny", async () => {
    const { rows } = await pg.query(
      `SELECT id, channel, discount_kc, subtotal_kc, shipping_kc, total_kc, customer_note FROM orders ORDER BY id`
    );
    expect(rows).toEqual([
      { id: THE_CUP[0], channel: "import", discount_kc: 0, subtotal_kc: 1137, shipping_kc: 0, total_kc: 1137, customer_note: null },
      { id: THE_CUP[1], channel: "import", discount_kc: 0, subtotal_kc: 758, shipping_kc: 0, total_kc: 758, customer_note: null },
    ]);
    const items = await pg.query(
      `SELECT count(*)::int AS n, count(product_variant_id)::int AS linked, count(sku_snapshot)::int AS skus FROM order_items`
    );
    expect(items.rows[0]).toEqual({ n: 5, linked: 0, skus: 0 });
  });

  it("CRM, uživatelé, faktury, Řízení firmy i katalog mají stejné schéma jako před kroky 3–5", async () => {
    const before = await createMigratedDb(SEED);
    expect(await schemaSnapshot(pg, { except: ORDER_TABLES })).toEqual(
      await schemaSnapshot(before.pg, { except: ORDER_TABLES })
    );
  });

  it("objednávka pořád musí mít organizaci (bez organizace až krok 7)", async () => {
    await expect(
      pg.exec(`INSERT INTO orders (subtotal_kc, total_kc, payment_status, channel, contact_email)
               VALUES (379, 379, 'unpaid', 'eshop', 'jana@example.cz')`)
    ).rejects.toThrow(/buyer_organization_id/);
  });
});

describe("krok 3 — systémový záznam v historii objednávky", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    ({ pg } = await dbBeforeSteps());
    await applySteps(pg);
  }, DB_TEST.timeout);

  it("dnešní zápis z MojeBegina (bez actor_type) je 'user' a musí mít autora", async () => {
    await pg.exec(`INSERT INTO order_activity (order_id, author_user_id, author_name, kind)
                   VALUES ('${THE_CUP[0]}', 'user-1', 'Jaroslav Viner', 'note_added')`);
    const { rows } = await pg.query(`SELECT actor_type FROM order_activity WHERE author_user_id = 'user-1'`);
    expect(rows).toEqual([{ actor_type: "user" }]);
    await expect(
      pg.exec(`INSERT INTO order_activity (order_id, kind) VALUES ('${THE_CUP[0]}', 'note_added')`)
    ).rejects.toThrow(/order_activity_user_has_author/);
  });

  it("systém a zákazník zapisují bez Neon Auth účtu, neznámý typ databáze odmítne", async () => {
    await pg.exec(`INSERT INTO order_activity (order_id, actor_type, author_name, kind)
                   VALUES ('${THE_CUP[0]}', 'system', 'E-shop', 'created'),
                          ('${THE_CUP[0]}', 'customer', 'Jana N.', 'note_added')`);
    await expect(
      pg.exec(`INSERT INTO order_activity (order_id, actor_type, kind) VALUES ('${THE_CUP[0]}', 'robot', 'created')`)
    ).rejects.toThrow(/order_activity_actor_type_check/);
  });
});

describe("krok 4 — nová pole objednávky", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    ({ pg } = await dbBeforeSteps());
    await applySteps(pg);
  }, DB_TEST.timeout);

  it("ruční objednávka jako dnes v createOrder dostane channel 'manual' a slevu 0", async () => {
    await pg.exec(`INSERT INTO orders (buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status)
                   VALUES ('${ORG}', 379, 99, 478, 'unpaid')`);
    const { rows } = await pg.query(`SELECT channel, discount_kc FROM orders WHERE total_kc = 478`);
    expect(rows).toEqual([{ channel: "manual", discount_kc: 0 }]);
  });

  it("e-shopová objednávka uloží dopravu, platbu, poznámku zákazníka a souhlasy", async () => {
    await pg.exec(`INSERT INTO orders (buyer_organization_id, channel, subtotal_kc, discount_kc, shipping_kc, total_kc,
                     payment_status, customer_note, shipping_method_code, shipping_method_label,
                     payment_method_code, payment_method_label, age_confirmed_at, terms_accepted_at)
                   VALUES ('${ORG}', 'eshop', 1000, 100, 99, 999, 'unpaid', 'Zvonit dvakrát', 'delivery',
                     'Rozvoz Begina', 'bank_transfer', 'Bankovní převod předem', now(), now())`);
    const { rows } = await pg.query(`SELECT channel, customer_note FROM orders WHERE total_kc = 999`);
    expect(rows).toEqual([{ channel: "eshop", customer_note: "Zvonit dvakrát" }]);
  });

  it("databáze odmítne nesedící součet, zápornou slevu a neznámý kanál", async () => {
    const insert = (cols: string, vals: string) =>
      pg.exec(`INSERT INTO orders (buyer_organization_id, payment_status, ${cols}) VALUES ('${ORG}', 'unpaid', ${vals})`);
    await expect(insert("subtotal_kc, shipping_kc, total_kc", "379, 99, 379")).rejects.toThrow(/orders_total_consistent/);
    await expect(insert("subtotal_kc, discount_kc, total_kc", "379, -10, 389")).rejects.toThrow(
      /orders_discount_nonnegative/
    );
    await expect(insert("subtotal_kc, total_kc, channel", "379, 379, 'woo'")).rejects.toThrow(/orders_channel_check/);
  });
});

describe("krok 5 — vazba položky na balení (SKU)", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    ({ pg } = await dbBeforeSteps());
    await applySteps(pg);
  }, DB_TEST.timeout);

  it("e-shopová objednávka jedním zápisem: objednávka + položka s vazbou + systémový záznam", async () => {
    const svarak = await variantId(pg, "svarak-deluxe-3l");
    await pg.exec(`BEGIN;
      INSERT INTO orders (id, buyer_organization_id, channel, subtotal_kc, shipping_kc, total_kc, payment_status)
      VALUES ('00000000-0000-4000-8000-0000000000e1', '${ORG}', 'eshop', 998, 99, 1097, 'unpaid');
      INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc, product_variant_id, sku_snapshot)
      VALUES ('00000000-0000-4000-8000-0000000000e1', 'Svařák Deluxe — 3 l Rodinná zásoba (bag-in-box)', 2, 499, 998,
              '${svarak}', 'svarak-deluxe-3l');
      INSERT INTO order_activity (order_id, actor_type, author_name, kind)
      VALUES ('00000000-0000-4000-8000-0000000000e1', 'system', 'E-shop', 'created');
      COMMIT;`);
    const { rows } = await pg.query(
      `SELECT i.sku_snapshot, v.sku, a.actor_type FROM order_items i
       JOIN product_variants v ON v.id = i.product_variant_id
       JOIN order_activity a ON a.order_id = i.order_id
       WHERE i.order_id = '00000000-0000-4000-8000-0000000000e1'`
    );
    expect(rows).toEqual([{ sku_snapshot: "svarak-deluxe-3l", sku: "svarak-deluxe-3l", actor_type: "system" }]);
  });

  it("prodané balení nejde smazat, jen deaktivovat; historie drží SKU i po přejmenování", async () => {
    const svarak = await variantId(pg, "svarak-deluxe-3l");
    await expect(pg.exec(`DELETE FROM product_variants WHERE id = '${svarak}'`)).rejects.toThrow(/order_items/);
    await pg.exec(`UPDATE product_variants SET sku = 'svarak-deluxe-3000ml', is_active = false WHERE id = '${svarak}'`);
    const { rows } = await pg.query(`SELECT sku_snapshot FROM order_items WHERE product_variant_id = '${svarak}'`);
    expect(rows).toEqual([{ sku_snapshot: "svarak-deluxe-3l" }]);
  });

  it("databáze odmítne vazbu bez SKU, nulové množství a nesedící řádek", async () => {
    const kulajda = await variantId(pg, "kulajda");
    const insert = (cols: string, vals: string) =>
      pg.exec(`INSERT INTO order_items (order_id, name, ${cols}) VALUES ('${THE_CUP[0]}', 'Kulajda', ${vals})`);
    await expect(
      insert("quantity, unit_price_kc, line_total_kc, product_variant_id", `1, 379, 379, '${kulajda}'`)
    ).rejects.toThrow(/order_items_variant_has_sku/);
    await expect(insert("quantity, unit_price_kc, line_total_kc", "0, 379, 0")).rejects.toThrow(
      /order_items_quantity_positive/
    );
    await expect(insert("quantity, unit_price_kc, line_total_kc", "2, 379, 379")).rejects.toThrow(
      /order_items_line_total_consistent/
    );
  });
});

describe("kroky 3–5 jsou vratné (docs/eshop-schema-draft/*_down.sql)", DB_TEST, () => {
  it("po návratu je schéma objednávek i data přesně jako před kroky 3–5", async () => {
    const reference = await dbBeforeSteps();
    const { pg } = await dbBeforeSteps();
    await applySteps(pg);

    const draftDir = path.join(__dirname, "../../../docs/eshop-schema-draft");
    for (const down of [
      "05_order_items_variant_down.sql",
      "04_orders_eshop_fields_down.sql",
      "03_order_activity_actor_down.sql",
    ]) {
      await pg.exec(readFileSync(path.join(draftDir, down), "utf8"));
    }

    expect(await schemaSnapshot(pg, { only: ORDER_TABLES })).toEqual(
      await schemaSnapshot(reference.pg, { only: ORDER_TABLES })
    );
    const data = `SELECT o.id, o.total_kc, count(i.id)::int AS items FROM orders o
                  JOIN order_items i ON i.order_id = o.id GROUP BY o.id ORDER BY o.id`;
    expect((await pg.query(data)).rows).toEqual((await reference.pg.query(data)).rows);
  });
});

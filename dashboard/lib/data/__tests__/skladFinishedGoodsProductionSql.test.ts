// SKLAD 1.1 (hotové výrobky) — GENERÁLKA produkčního postupu (docs/sklad
// 20 → 21 → 22, 29) nad PGlite ve stavu Production PO Skladu 1.0 (0029) —
// migrace 0030 je další, oddělená fáze (viz scripts/sklad-1-1-production/
// build-sql.mjs). Spouští PŘESNĚ ty soubory, které se budou vkládat do
// Neon SQL Editoru. Nic se nepřipojuje k Neonu; skripty se tu jen zkouší,
// nespouští naostro. Stejný vzor jako lib/data/__tests__/skladProductionSql.test.ts
// pro 0028+0029 (ten test zůstává pinovaný na 0029 — oddělený rozsah).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";
import {
  PRODUCTION_MAIN_TIMELINE_ID,
  previewMigrationSql,
  productionMigrationSql,
  SKLAD_1_1_TAG,
} from "../../../scripts/sklad-1-1-production/build-sql.mjs";

const DOCS = path.join(__dirname, "../../../docs/sklad");
const file = (name: string) => readFileSync(path.join(DOCS, name), "utf8");
const DB_TEST = { timeout: 180_000 };
const OTHER_TIMELINE = "00000000000000000000000000000000";

async function productionReplica(timeline: string | null = PRODUCTION_MAIN_TIMELINE_ID): Promise<PGlite> {
  const { pg } = await createMigratedDb("0029_sklad_1_0_znovu_precist");
  await pg.exec(`
    INSERT INTO organizations (id, ico, name, registered_address) VALUES ('11111111-1111-4111-8111-111111111111', '11935367', 'The Cup s.r.o.', 'Praha');
    INSERT INTO orders (id, buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status, ordered_at)
    VALUES ('329f54d5-5a7d-4522-a21e-b7ad9cde24e2', '11111111-1111-4111-8111-111111111111', 758, 0, 758, 'paid', '2026-08-30');`);
  if (timeline !== null) await pg.exec(`SET neon.timeline_id = '${timeline}'`);
  return pg;
}

/** Kontrolní SELECT jako v Neon SQL Editoru: „a | b | c“. */
async function check(pg: PGlite, sqlText: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(sqlText.replace(/--[^\n]*\n/g, "\n"));
  return Object.values(rows[0]).map((v) => (v === null ? "NULL" : String(v))).join(" | ");
}

/** Otisk schématu: sloupce, omezení, indexy, triggery, pohledy, funkce. */
async function schemaPrint(pg: PGlite): Promise<string[]> {
  const { rows } = await pg.query<{ k: string }>(`
    SELECT 'col ' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '') AS k
      FROM information_schema.columns WHERE table_schema = 'public'
    UNION ALL SELECT 'con ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    UNION ALL SELECT 'idx ' || indexdef FROM pg_indexes WHERE schemaname = 'public'
    UNION ALL SELECT 'trg ' || tgrelid::regclass || ' ' || tgname || ' ' || pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal
    UNION ALL SELECT 'view ' || table_name || ' ' || view_definition FROM information_schema.views WHERE table_schema = 'public'
    UNION ALL SELECT 'fn ' || proname || ' ' || md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
    ORDER BY 1`);
  return rows.map((r) => r.k);
}

describe("docs/sklad (0030) — soubory odpovídají generátoru (nikdo je neupravil ručně)", () => {
  it("21_migration.sql = chráněná verze drizzle 0030 jen pro Production main", () => {
    expect(file("21_migration.sql")).toBe(productionMigrationSql());
    expect(file("21_migration_PREVIEW.sql")).toBe(previewMigrationSql());
  });

  it("migrace obsahuje přesně drizzle soubor 0030, nic navíc kromě pojistky", () => {
    const sqlText = file("21_migration.sql");
    const body = readFileSync(path.join(__dirname, `../../../drizzle/${SKLAD_1_1_TAG}.sql`), "utf8").replaceAll("--> statement-breakpoint", "").trim();
    expect(sqlText).toContain(body);
    expect(sqlText.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sqlText.match(/^COMMIT;$/gm)).toHaveLength(1);
  });
});

describe("generálka na kopii Production (po 0029): před → migrace → po → vrácení", DB_TEST, () => {
  it("20 → 21 → 22 dá přesně stejné schéma jako kód; data beze změny; podruhé STOP", async () => {
    const pg = await productionReplica();
    expect(await check(pg, file("20_before.sql"))).toBe("true | 1 | 0 | 0 | 1 | 0 | 7 | 0");

    await pg.exec(file("21_migration.sql"));
    expect(await check(pg, file("22_after.sql"))).toBe("2 | 1 | 4 | 1 | 1 | 0 | 0 | 1 | 0 | 7 | 0");

    const { pg: code } = await createMigratedDb();
    expect(await schemaPrint(pg)).toEqual(await schemaPrint(code));

    const before = await schemaPrint(pg);
    await expect(pg.exec(file("21_migration.sql"))).rejects.toThrow(/STOP: Sklad 1.1 \(hotové výrobky\) už existuje/);
    await pg.exec("ROLLBACK");
    expect(await schemaPrint(pg)).toEqual(before);
  });

  it("jiná větev (backup, Preview) nebo mimo Neon → STOP, nic se nezmění", async () => {
    for (const timeline of [OTHER_TIMELINE, null]) {
      const pg = await productionReplica(timeline);
      const before = await schemaPrint(pg);
      await expect(pg.exec(file("21_migration.sql"))).rejects.toThrow(/STOP: tohle NENÍ Production větev main/);
      await pg.exec("ROLLBACK");
      expect(await schemaPrint(pg)).toEqual(before);
    }
  });

  it("bez Skladu 1.0 (0028+0029) → STOP", async () => {
    const { pg } = await createMigratedDb("0027_prace_2_0_photos_approval");
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN_TIMELINE_ID}'`);
    await expect(pg.exec(file("21_migration.sql"))).rejects.toThrow(/STOP: chybí Sklad 1.0 migrace 0028\+0029/);
  });

  it("Preview verze: na Production main odmítne, na jiné větvi projde se stejným výsledkem", async () => {
    const prod = await productionReplica();
    await expect(prod.exec(file("21_migration_PREVIEW.sql"))).rejects.toThrow(/STOP: tohle je Production větev main/);

    const preview = await productionReplica(OTHER_TIMELINE);
    await preview.exec(file("21_migration_PREVIEW.sql"));
    expect(await check(preview, file("22_after.sql"))).toBe("2 | 1 | 4 | 1 | 1 | 0 | 0 | 1 | 0 | 7 | 0");
  });

  it("29_rollback: bez dat vrátí přesně stav po 0029; se šarží/rezervací/pohybem výroby STOP a nic nezmění", async () => {
    const pg = await productionReplica();
    const original = await schemaPrint(pg);
    await pg.exec(file("21_migration.sql"));

    await pg.exec(`
      INSERT INTO stock_locations (id, code, name) VALUES ('33333333-3333-4333-8333-333333333333', 'vyroba', 'Výroba');
      INSERT INTO stock_items (id, name, canonical_unit, kind) VALUES ('44444444-4444-4444-8444-444444444444', 'Dýňová polévka', 'ks', 'finished_good');
      INSERT INTO stock_batches (id, stock_item_id, batch_code, produced_at, best_before_at, created_by_user_id)
      VALUES ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 'L-TEST-01', '2026-11-06', '2027-05-06', 'test');`);
    const withData = await schemaPrint(pg);
    await expect(pg.exec(file("29_rollback.sql"))).rejects.toThrow(/Vrácení zastaveno/);
    await pg.exec("ROLLBACK");
    expect(await schemaPrint(pg)).toEqual(withData);
    expect((await pg.query(`SELECT 1 FROM stock_batches`)).rows).toHaveLength(1);

    await pg.exec(`DELETE FROM stock_batches`);
    await pg.exec(`DELETE FROM stock_items`);
    await pg.exec(`DELETE FROM stock_locations`);
    await pg.exec(file("29_rollback.sql"));
    expect(await schemaPrint(pg)).toEqual(original);
    expect(await check(pg, file("20_before.sql"))).toBe("true | 1 | 0 | 0 | 1 | 0 | 7 | 0");
  });
});

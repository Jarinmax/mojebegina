// SKLAD 1.0 — GENERÁLKA produkčního postupu (docs/sklad 10 → 11 → 12, 19)
// nad PGlite ve stavu „Production po e-shopu 0022“ (createMigratedDb až po
// 0022, stejně jako lib/eshop/__tests__/productionRehearsal.test.ts).
// Spouští PŘESNĚ ty soubory, které se budou vkládat do Neon SQL Editoru.
// Nic se nepřipojuje k Neonu; skripty se tu jen zkouší, nespouští naostro.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";
import {
  PRODUCTION_MAIN_TIMELINE_ID,
  previewMigrationSql,
  productionMigrationSql,
} from "../../../scripts/sklad-production/build-sql.mjs";

const DOCS = path.join(__dirname, "../../../docs/sklad");
const file = (name: string) => readFileSync(path.join(DOCS, name), "utf8");
const DB_TEST = { timeout: 180_000 };
const OTHER_TIMELINE = "00000000000000000000000000000000";

async function productionReplica(timeline: string | null = PRODUCTION_MAIN_TIMELINE_ID): Promise<PGlite> {
  const { pg } = await createMigratedDb("0022_eshop_1_0_company_invoicing");
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

describe("docs/sklad — soubory odpovídají generátoru (nikdo je neupravil ručně)", () => {
  it("11_migration.sql = chráněná verze drizzle 0023 + 0024 jen pro Production main", () => {
    expect(file("11_migration.sql")).toBe(productionMigrationSql());
    expect(file("11_migration_PREVIEW.sql")).toBe(previewMigrationSql());
  });

  it("migrace obsahuje přesně oba drizzle soubory, nic navíc kromě pojistky", () => {
    const sqlText = file("11_migration.sql");
    for (const tag of ["0023_sklad_1_0_zaklad", "0024_sklad_1_0_znovu_precist"]) {
      const body = readFileSync(path.join(__dirname, `../../../drizzle/${tag}.sql`), "utf8").replaceAll("--> statement-breakpoint", "").trim();
      expect(sqlText).toContain(body);
    }
    expect(sqlText.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sqlText.match(/^COMMIT;$/gm)).toHaveLength(1);
  });
});

describe("generálka na kopii Production (0022): před → migrace → po → vrácení", DB_TEST, () => {
  it("10 → 11 → 12 dá přesně stejné schéma jako kód; data e-shopu beze změny; podruhé STOP", async () => {
    const pg = await productionReplica();
    expect(await check(pg, file("10_before.sql"))).toBe("true | 1 | 1 | 0 | 0 | 1 | 0 | 7");

    await pg.exec(file("11_migration.sql"));
    expect(await check(pg, file("12_after.sql"))).toBe("10 | 1 | 4 | 1 | 0 | 0 | 0 | 0 | 4 | 1 | 1 | 1 | 0 | 7");

    const { pg: code } = await createMigratedDb();
    expect(await schemaPrint(pg)).toEqual(await schemaPrint(code));

    const before = await schemaPrint(pg);
    await expect(pg.exec(file("11_migration.sql"))).rejects.toThrow(/STOP: skladové tabulky už existují/);
    await pg.exec("ROLLBACK");
    expect(await schemaPrint(pg)).toEqual(before);
  });

  it("jiná větev (backup, Preview) nebo mimo Neon → STOP, nic se nezmění", async () => {
    for (const timeline of [OTHER_TIMELINE, null]) {
      const pg = await productionReplica(timeline);
      const before = await schemaPrint(pg);
      await expect(pg.exec(file("11_migration.sql"))).rejects.toThrow(/STOP: tohle NENÍ Production větev main/);
      await pg.exec("ROLLBACK");
      expect(await schemaPrint(pg)).toEqual(before);
    }
  });

  it("bez e-shopu 0022 → STOP", async () => {
    const { pg } = await createMigratedDb("0021_eshop_1_0_variant_weight");
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_MAIN_TIMELINE_ID}'`);
    await expect(pg.exec(file("11_migration.sql"))).rejects.toThrow(/STOP: chybí e-shopové migrace do 0022/);
  });

  it("Preview verze: na Production main odmítne, na jiné větvi projde se stejným výsledkem", async () => {
    const prod = await productionReplica();
    await expect(prod.exec(file("11_migration_PREVIEW.sql"))).rejects.toThrow(/STOP: tohle je Production větev main/);

    const preview = await productionReplica(OTHER_TIMELINE);
    await preview.exec(file("11_migration_PREVIEW.sql"));
    expect(await check(preview, file("12_after.sql"))).toBe("10 | 1 | 4 | 1 | 0 | 0 | 0 | 0 | 4 | 1 | 1 | 1 | 0 | 7");
  });

  it("19_rollback: bez dat vrátí přesně stav před skladem; s daty STOP a nic nezmění", async () => {
    const pg = await productionReplica();
    const original = await schemaPrint(pg);
    await pg.exec(file("11_migration.sql"));

    await pg.exec(`INSERT INTO suppliers (name, name_normalized) VALUES ('Makro', 'makro')`);
    const withData = await schemaPrint(pg);
    await expect(pg.exec(file("19_rollback.sql"))).rejects.toThrow(/Vrácení zastaveno/);
    await pg.exec("ROLLBACK");
    expect(await schemaPrint(pg)).toEqual(withData);
    expect((await pg.query(`SELECT 1 FROM suppliers`)).rows).toHaveLength(1);

    await pg.exec(`DELETE FROM suppliers`);
    await pg.exec(file("19_rollback.sql"));
    expect(await schemaPrint(pg)).toEqual(original);
    expect(await check(pg, file("10_before.sql"))).toBe("true | 1 | 1 | 0 | 0 | 1 | 0 | 7");
  });
});

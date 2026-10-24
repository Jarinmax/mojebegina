// GPT/MCP pilot — produkční skripty docs/gpt-mcp: návrat (19) vrátí DB přesně
// do stavu před migrací a odmítne smazat existující poznámky u zákazníků.
// Migraci samotnou nad kopií Production ověřuje productionRehearsal.test.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";

const file = (name: string) => readFileSync(path.join(__dirname, "../../../docs/gpt-mcp", name), "utf8");
const tables = async (pg: import("@electric-sql/pglite").PGlite) =>
  (await pg.query<{ t: string }>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`)).rows.map(
    (r) => r.t
  );

describe("docs/gpt-mcp — migrace a návrat", { timeout: 60_000 }, () => {
  it("11 → 19 vrátí přesně stav po 0023; 19 nesmaže poznámky u zákazníků", async () => {
    const { pg } = await createMigratedDb("0023_idoklad_read_log");
    const before = await tables(pg);

    await pg.exec(file("11_migration.sql"));
    expect((await tables(pg)).length).toBe(before.length + 4);

    await pg.exec(`
      INSERT INTO organizations (id, ico, name, registered_address) VALUES ('00000000-0000-4000-8000-000000000001', '1', 'X', 'Y');
      INSERT INTO organization_activity (organization_id, author_user_id, kind, body)
        VALUES ('00000000-0000-4000-8000-000000000001', 'u', 'note_added', 'poznámka');`);
    await expect(pg.exec(file("19_rollback.sql"))).rejects.toThrow(/exportujte/);

    await pg.exec(`DELETE FROM organization_activity`);
    await pg.exec(file("19_rollback.sql"));
    expect(await tables(pg)).toEqual(before);
  });

  it("11_migration_PREVIEW: STOP na Production i bez dosazené větve; na dosazené větvi = 11_migration", async () => {
    const preview = file("11_migration_PREVIEW.sql");
    const tail = (sql: string) => sql.slice(sql.indexOf("  IF EXISTS (SELECT 1 FROM information_schema.tables"));
    expect(tail(preview)).toBe(tail(file("11_migration.sql"))); // tělo se nesmí rozejít

    const { pg } = await createMigratedDb("0023_idoklad_read_log");
    const before = await tables(pg);
    // bez neon.* nastavení (nenahrazený zástupný text) → STOP
    await expect(pg.exec(preview)).rejects.toThrow(/STOP/);
    // Production timeline → STOP, i kdyby někdo dosadil její branch_id
    await pg.exec(`SELECT set_config('neon.timeline_id', '70a96b3677653646e65343cae8e27182', false),
                          set_config('neon.branch_id', 'br-odd-surf-b2by4tja', false)`);
    await expect(pg.exec(preview.replaceAll("<PREVIEW_BRANCH_ID>", "br-odd-surf-b2by4tja"))).rejects.toThrow(/Production/);
    // jiná větev než dosazená → STOP
    await pg.exec(`SELECT set_config('neon.timeline_id', 'aaaa', false), set_config('neon.branch_id', 'br-jina', false)`);
    await expect(pg.exec(preview.replaceAll("<PREVIEW_BRANCH_ID>", "br-preview-pilot"))).rejects.toThrow(/STOP/);
    expect(await tables(pg)).toEqual(before);

    // správná Preview větev → migrace proběhne, kontroly sedí
    await pg.exec(`SELECT set_config('neon.branch_id', 'br-preview-pilot', false)`);
    const where = await pg.query<Record<string, unknown>>(file("00_kde_jsem.sql"));
    expect(where.rows[0]).toMatchObject({ branch_id: "br-preview-pilot", je_production: "ne", tabulek: 30, weight_g: 1, pilot: 0 });
    await pg.exec(preview.replaceAll("<PREVIEW_BRANCH_ID>", "br-preview-pilot"));
    const after = await pg.query<Record<string, unknown>>(file("12_after.sql"));
    expect(Object.values(after.rows[0]).map(String)).toEqual(["4", "4", "0", "0"]);
  });

  it("13_pilot_uzivatel: najde userId a ověří roli", async () => {
    const { pg } = await createMigratedDb();
    await pg.exec(`
      INSERT INTO user_profiles (user_id, name, email) VALUES ('u-1', 'Jaroslav Viner', 'Pilot@Example.cz'), ('u-2', 'Zákazník', 'z@example.cz');
      INSERT INTO user_roles (user_id, system_role) VALUES ('u-1', 'CUSTOMER'), ('u-1', 'EXECUTIVE'), ('u-2', 'CUSTOMER');`);
    const sql = file("13_pilot_uzivatel.sql");
    expect((await pg.query(sql.replaceAll("<E-MAIL>", "pilot@example.cz"))).rows).toEqual([
      { user_id: "u-1", name: "Jaroslav Viner", role: "CUSTOMER, EXECUTIVE", smi_asistenta: "ano" },
    ]);
    expect((await pg.query(sql.replaceAll("<E-MAIL>", "z@example.cz"))).rows).toMatchObject([{ smi_asistenta: "NE" }]);
  });
});

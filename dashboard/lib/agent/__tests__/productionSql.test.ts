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
  it("11 → 19 vrátí přesně stav po 0021; 19 nesmaže poznámky u zákazníků", async () => {
    const { pg } = await createMigratedDb("0021_eshop_1_0_variant_weight");
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
});

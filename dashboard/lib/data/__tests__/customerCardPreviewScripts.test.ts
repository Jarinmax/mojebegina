// docs/nahled-zakaznika — skripty pro Preview/Production (migrace 0023
// s pojistkou, udělení 4 členům vedení podle user_id, odebrání, návrat).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";

const file = (name: string) =>
  readFileSync(
    path.join(__dirname, "../../../docs/nahled-zakaznika", name),
    "utf8",
  );
const check = async (pg: PGlite, sql: string) =>
  Object.values((await pg.query(sql)).rows[0] as object).join(" | ");
const MEMBERS = {
  "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c": ["Jaroslav Viner", "ADMIN"],
  "f9f93f03-92b0-4724-becd-c0a3576b5275": ["Lucie Königsbergová", "EXECUTIVE"],
  "fdc7b836-2325-4568-b9b7-5ac579cd8972": ["Jiří Střelec", "EXECUTIVE"],
  "06240ac4-c050-47ea-998c-6c81389edf9f": ["Jaroslav Blahout", "EXECUTIVE"],
};

async function seedMembers(pg: PGlite, skip: string[] = []) {
  for (const [id, [name, role]] of Object.entries(MEMBERS)) {
    if (skip.includes(id)) continue;
    await pg.query(
      `INSERT INTO user_profiles (user_id, name, email) VALUES ($1, $2, $3)`,
      [id, name, `${id}@x.cz`],
    );
    await pg.query(
      `INSERT INTO user_roles (user_id, system_role) VALUES ($1, $2)`,
      [id, role],
    );
  }
}

const schema = async (db: PGlite) =>
  (
    await db.query(`
      SELECT 'col' AS kind, table_name AS t, column_name AS n, data_type || ':' || is_nullable || ':' || coalesce(column_default, '') AS d
        FROM information_schema.columns WHERE table_schema = 'public'
      UNION ALL SELECT 'con', table_name, constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = 'public'
      UNION ALL SELECT 'idx', tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
      ORDER BY 1, 2, 3`)
  ).rows;

describe(
  "docs/nahled-zakaznika — migrace, udělení, odebrání, návrat",
  { timeout: 120_000 },
  () => {
    it("před → migrace (= drizzle 0023) → po; opakování se zastaví; návrat = stav před", async () => {
      const { pg } = await createMigratedDb("0022_gpt_mcp_pilot");
      await seedMembers(pg);
      const before = await schema(pg);
      expect(
        await check(
          pg,
          file("10_before.sql").split(";\n\nSELECT p.user_id")[0],
        ),
      ).toBe("0 | 4 | 4");
      await pg.exec(file("11_migration.sql"));
      expect(await check(pg, file("12_after.sql"))).toBe("2 | 3 | 0 | 0");
      const { pg: reference } = await createMigratedDb(
        "0023_customer_card_preview",
      );
      expect(await schema(pg)).toEqual(await schema(reference));
      await expect(pg.exec(file("11_migration.sql"))).rejects.toThrow(
        /už existuje/,
      );
      await pg.exec(file("19_rollback.sql"));
      expect(await schema(pg)).toEqual(before);
    });

    it("udělení: přesně 4 podle user_id, opakování nic nezdvojí; odebrání platí, historie zůstává", async () => {
      const { pg } = await createMigratedDb("0023_customer_card_preview");
      await seedMembers(pg);
      await pg.exec(file("20_udelit.sql"));
      await pg.exec(file("20_udelit.sql"));
      const active = async () =>
        (
          await pg.query<{ user_id: string }>(
            `SELECT user_id FROM user_permissions WHERE permission = 'customer_card_preview' AND revoked_at IS NULL ORDER BY user_id`,
          )
        ).rows.map((r) => r.user_id);
      expect(await active()).toEqual(Object.keys(MEMBERS).sort());
      await pg.exec(
        file("29_odebrat.sql")
          .replaceAll("<USER_ID>", "fdc7b836-2325-4568-b9b7-5ac579cd8972")
          .replaceAll("<KDO_ODEBIRA>", "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c"),
      );
      expect(await active()).not.toContain(
        "fdc7b836-2325-4568-b9b7-5ac579cd8972",
      );
      expect(
        (await pg.query(`SELECT count(*)::int AS n FROM user_permissions`))
          .rows,
      ).toEqual([{ n: 4 }]);
    });

    it("pojistky udělení: chybějící účet nebo účet bez role vedení → nic se neudělí", async () => {
      const { pg } = await createMigratedDb("0023_customer_card_preview");
      await seedMembers(pg, ["f9f93f03-92b0-4724-becd-c0a3576b5275"]);
      await expect(pg.exec(file("20_udelit.sql"))).rejects.toThrow(
        /neexistuje/,
      );
      expect(
        (await pg.query(`SELECT count(*)::int AS n FROM user_permissions`))
          .rows,
      ).toEqual([{ n: 0 }]);

      const second = await createMigratedDb("0023_customer_card_preview");
      await seedMembers(second.pg);
      await second.pg.exec(
        `UPDATE user_roles SET system_role = 'CUSTOMER' WHERE user_id = '06240ac4-c050-47ea-998c-6c81389edf9f'`,
      );
      await expect(second.pg.exec(file("20_udelit.sql"))).rejects.toThrow(
        /nemá roli ADMIN ani EXECUTIVE/,
      );
      expect(
        (
          await second.pg.query(
            `SELECT count(*)::int AS n FROM user_permissions`,
          )
        ).rows,
      ).toEqual([{ n: 0 }]);
    });

    it("návrat se zastaví, když audit obsahuje záznamy", async () => {
      const { pg } = await createMigratedDb("0023_customer_card_preview");
      await pg.exec(`INSERT INTO organizations (id, ico, name, registered_address) VALUES ('00000000-0000-4000-8000-000000000001', '1', 'X', 'Y');
      INSERT INTO customer_card_preview_log (viewer_user_id, organization_id) VALUES ('u', '00000000-0000-4000-8000-000000000001')`);
      await expect(pg.exec(file("19_rollback.sql"))).rejects.toThrow(
        /exportujte/,
      );
    });
  },
);

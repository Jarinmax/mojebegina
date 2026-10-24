// GPT/MCP pilot — varianta B: čtecí role lucy_readonly pro Production
// (docs/gpt-mcp/30 a 39). Ověřeno nad PGlite ve stavu Production (migrace
// do 0021, bez tabulek pilotu): pojistka větve, jen SELECT na vyjmenované
// tabulky a sloupce, žádný přístup k agent_*, surovým platbám a payloadům,
// role nesmí nic měnit ani vytvářet; návrat roli úplně odstraní.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";
import { scramVerifier } from "../../../docs/gpt-mcp/scram-verifier.mjs";

const file = (name: string) => readFileSync(path.join(__dirname, "../../../docs/gpt-mcp", name), "utf8");
const PRODUCTION_BRANCH = "br-odd-surf-b2by4tja";

function roleScript(verifier: string, database = "postgres") {
  const sql = file("30_production_readonly_role.sql");
  // jen blok DO (kontrolní SELECTy na konci jsou pro člověka v editoru);
  // PGlite má databázi „postgres“, Production „neondb“
  return sql
    .slice(0, sql.indexOf("-- Kontrola po spuštění"))
    .replace("<SCRAM_OTISK>", () => verifier)
    .replace("IF current_database() <> 'neondb' THEN", `IF current_database() <> '${database}' THEN`);
}

describe("docs/gpt-mcp 30/39 — čtecí role pro Production", { timeout: 60_000 }, () => {
  it("SCRAM otisk má formát, který Postgres přijme jako heslo", () => {
    const verifier = scramVerifier("heslo-pro-test", Buffer.alloc(16, 1));
    expect(verifier).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(verifier).not.toContain("heslo-pro-test");
  });

  it("pojistky: jiná větev, nevyplněný otisk, existující role", async () => {
    const { pg } = await createMigratedDb("0021_eshop_1_0_variant_weight");
    const verifier = scramVerifier("x");
    await expect(pg.exec(roleScript(verifier))).rejects.toThrow(/Toto není Production/);
    await pg.exec(`SET neon.branch_id = 'br-super-dust-b2wbw2wk'`);
    await expect(pg.exec(roleScript(verifier))).rejects.toThrow(/Toto není Production/);
    await pg.exec(`SET neon.branch_id = '${PRODUCTION_BRANCH}'`);
    await expect(pg.exec(roleScript(verifier, "neondb"))).rejects.toThrow(/Očekávaná databáze neondb/);
    await expect(pg.exec(roleScript("<SCRAM_OTISK>"))).rejects.toThrow(/Do řádku verifier vložte otisk/);
    expect((await pg.query(`SELECT 1 FROM pg_roles WHERE rolname = 'lucy_readonly'`)).rows).toHaveLength(0);
  });

  it("role smí jen číst vyjmenované; návrat ji úplně odstraní", async () => {
    const { pg } = await createMigratedDb("0021_eshop_1_0_variant_weight");
    await pg.exec(`SET neon.branch_id = '${PRODUCTION_BRANCH}'`);
    await pg.exec(roleScript(scramVerifier("x")));
    await expect(pg.exec(roleScript(scramVerifier("x")))).rejects.toThrow(/už existuje/);

    const [role] = (
      await pg.query<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolconfig: string[]; rolconnlimit: number }>(
        `SELECT rolsuper, rolcreatedb, rolcreaterole, rolconfig, rolconnlimit FROM pg_roles WHERE rolname = 'lucy_readonly'`
      )
    ).rows;
    expect(role).toMatchObject({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolconnlimit: 5 });
    expect(role.rolconfig).toEqual(
      expect.arrayContaining([
        "default_transaction_read_only=on",
        "statement_timeout=15s",
        "lock_timeout=2s",
        "idle_in_transaction_session_timeout=10s",
        "search_path=public",
      ])
    );

    await pg.exec(`INSERT INTO organizations (id, ico, name, registered_address) VALUES ('00000000-0000-4000-8000-000000000001', '1', 'X', 'Y')`);
    await pg.exec(`SET ROLE lucy_readonly`);
    try {
      expect((await pg.query(`SELECT count(*)::int AS n FROM organizations`)).rows).toEqual([{ n: 1 }]);
      await pg.query(`SELECT id, amount_hal, status FROM payments`);
      await pg.query(`SELECT id, state, external_number FROM invoice_provider_links`);
      await pg.query(`SELECT * FROM order_payment_balance`);
      for (const denied of [
        `SELECT raw FROM payments`,
        `SELECT external_id FROM payments`,
        `SELECT * FROM payments`,
        `SELECT request_payload FROM invoice_provider_links`,
        `SELECT external_url FROM invoice_provider_links`,
        `SELECT * FROM user_activations`,
        `SELECT * FROM invoice_customers`,
        `SELECT * FROM notifications`,
        `INSERT INTO organizations (id, ico, name, registered_address) VALUES ('00000000-0000-4000-8000-000000000002', '2', 'X', 'Y')`,
        `UPDATE leads SET stage = 'new'`,
        `DELETE FROM orders`,
        `CREATE TABLE lucy_pokus (id int)`,
      ]) {
        await expect(pg.query(denied), denied).rejects.toThrow(/permission denied|must be owner/);
      }
    } finally {
      await pg.exec(`RESET ROLE`);
    }

    await pg.exec(file("39_production_readonly_role_rollback.sql"));
    expect((await pg.query(`SELECT 1 FROM pg_roles WHERE rolname = 'lucy_readonly'`)).rows).toHaveLength(0);
    // druhé spuštění návratu nic nerozbije
    await pg.exec(file("39_production_readonly_role_rollback.sql"));
  });

  it("s tabulkami pilotu dostane role i poznámky u zákazníků, ale nikdy agent_*", async () => {
    const { pg } = await createMigratedDb();
    await pg.exec(`SET neon.branch_id = '${PRODUCTION_BRANCH}'`);
    await pg.exec(roleScript(scramVerifier("x")));
    const can = async (table: string) =>
      (await pg.query<{ ok: boolean }>(`SELECT has_table_privilege('lucy_readonly', 'public.${table}', 'SELECT') AS ok`)).rows[0].ok;
    expect(await can("organization_activity")).toBe(true);
    for (const table of ["agent_grants", "agent_tokens", "agent_audit_log"]) expect(await can(table), table).toBe(false);
  });
});

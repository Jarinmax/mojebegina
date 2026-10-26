// GPT/MCP pilot — role lucy_readonly (docs/gpt-mcp/30 a 39) proti SKUTEČNÉMU
// PostgreSQL, ne PGlite: přihlášení heslem přes SCRAM otisk, povolené SELECTy,
// zákaz INSERT/UPDATE/DELETE/DDL i po vypnutí read-only, práva přes PUBLIC,
// funkce SECURITY DEFINER, přesné sloupcové granty a návrat.
//
// Napodobuje Neon: databázi neondb vlastní NE-superuser neondb_owner
// (CREATEROLE), migrace a skript běží pod ním; schéma neon_auth vlastní
// role neon_auth; PUBLIC má na databázi výchozí CONNECT + TEMP.
//
// Spouští se JEN ručně proti lokálnímu jednorázovému serveru (smaže a znovu
// založí databázi neondb!):
//   LUCY_ROLE_TEST_PG=postgresql://postgres:HESLO@127.0.0.1:55432/postgres npx vitest run productionRole.postgres
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { migrationSql, migrationTags } from "@/lib/eshop/__tests__/helpers/migratedDb";
import { scramVerifier } from "../../../docs/gpt-mcp/scram-verifier.mjs";

const ADMIN_URL = process.env.LUCY_ROLE_TEST_PG;
const PRODUCTION_BRANCH = "br-odd-surf-b2by4tja";
const OWNER_PASSWORD = "owner-local-test";
const LUCY_PASSWORD = "LucyLocalTest123";

const file = (name: string) => readFileSync(path.join(__dirname, "../../../docs/gpt-mcp", name), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

describe.skipIf(!ADMIN_URL)("lucy_readonly na skutečném PostgreSQL", { timeout: 120_000 }, () => {
  async function connect(url: string): Promise<Client> {
    // pg je jen tranzitivní závislost bez typů — načíst dynamicky podle jména
    const moduleName = "pg";
    const { Client: PgClient } = await import(/* @vite-ignore */ moduleName);
    const client = new PgClient({ connectionString: url });
    await client.connect();
    return client;
  }
  const urlFor = (user: string, password: string, db: string) => {
    const u = new URL(ADMIN_URL!);
    u.username = encodeURIComponent(user);
    u.password = encodeURIComponent(password);
    u.pathname = `/${db}`;
    return u.toString();
  };

  async function setup() {
    const admin = await connect(ADMIN_URL!);
    await admin.query(`DROP DATABASE IF EXISTS neondb WITH (FORCE)`);
    for (const role of ["lucy_readonly", "neon_auth", "neondb_owner"]) {
      const exists = (await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role])).rowCount;
      if (exists) {
        await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined);
        await admin.query(`DROP ROLE ${role}`);
      }
    }
    await admin.query(`CREATE ROLE neondb_owner LOGIN CREATEROLE CREATEDB PASSWORD '${OWNER_PASSWORD}'`);
    await admin.query(`CREATE ROLE neon_auth NOLOGIN`);
    await admin.query(`CREATE DATABASE neondb OWNER neondb_owner`);
    await admin.query(`ALTER DATABASE neondb SET neon.branch_id = '${PRODUCTION_BRANCH}'`);
    await admin.end();

    const su = await connect(urlFor("postgres", new URL(ADMIN_URL!).password, "neondb"));
    await su.query(`CREATE SCHEMA neon_auth AUTHORIZATION neon_auth`);
    await su.query(`CREATE TABLE neon_auth.session (id text, token text)`);
    await su.query(`ALTER TABLE neon_auth.session OWNER TO neon_auth`);
    // jako v Neonu: schéma public patří pg_database_owner, PUBLIC má jen USAGE
    await su.end();

    const owner = await connect(urlFor("neondb_owner", OWNER_PASSWORD, "neondb"));
    for (const tag of migrationTags) {
      for (const statement of migrationSql(tag).split("--> statement-breakpoint")) {
        if (statement.trim()) await owner.query(statement);
      }
      if (tag === "0021_eshop_1_0_variant_weight") break; // stav Production
    }
    await owner.query(`
      INSERT INTO organizations (id, ico, name, registered_address) VALUES ('00000000-0000-4000-8000-000000000001', '1', 'X', 'Y');
      INSERT INTO payments (id, source, external_id, method, direction, status, amount_hal, match_status, raw)
        VALUES ('00000000-0000-4000-8000-000000000002', 'bank', 'TAJNE_EXT', 'bank_transfer', 'inflow', 'pending', 100, 'unmatched', '{"tajne": 1}');`);
    return owner;
  }

  function roleScript(verifier: string) {
    const sql = file("30_production_readonly_role.sql");
    return sql.slice(0, sql.indexOf("-- Kontrola po spuštění")).replace("<SCRAM_OTISK>", () => verifier);
  }

  async function denied(client: Client, sql: string) {
    let error: unknown = null;
    try {
      await client.query(sql);
    } catch (e) {
      error = e;
    }
    expect(error, sql).not.toBeNull();
    return String((error as Error).message);
  }

  it("celý průběh: založení, přihlášení, jen čtení i po vypnutí read-only, návrat", async () => {
    const owner = await setup();
    // skript běží pod vlastníkem databáze (ne superuserem), jako v Neon SQL Editoru
    await owner.query(roleScript(scramVerifier(LUCY_PASSWORD)));

    // špatné heslo neprojde, správné ano (SCRAM otisk funguje jako heslo)
    await expect(connect(urlFor("lucy_readonly", "spatne-heslo", "neondb"))).rejects.toThrow(/password authentication failed/);
    const lucy = await connect(urlFor("lucy_readonly", LUCY_PASSWORD, "neondb"));

    try {
      expect((await lucy.query(`SHOW default_transaction_read_only`)).rows[0].default_transaction_read_only).toBe("on");
      expect((await lucy.query(`SHOW statement_timeout`)).rows[0].statement_timeout).toBe("15s");
      expect((await lucy.query(`SELECT current_setting('neon.branch_id', true) AS b`)).rows[0].b).toBe(PRODUCTION_BRANCH);

      // povolené čtení
      expect((await lucy.query(`SELECT count(*)::int AS n FROM organizations`)).rows[0].n).toBe(1);
      expect((await lucy.query(`SELECT id, amount_hal, status, match_status FROM payments`)).rows).toHaveLength(1);
      expect((await lucy.query(`SELECT count(*)::int AS n FROM payments`)).rows[0].n).toBe(1);
      await lucy.query(`SELECT id, state, external_number FROM invoice_provider_links`);
      await lucy.query(`SELECT * FROM order_payment_balance`);

      // zakázané čtení
      for (const sql of [
        `SELECT raw FROM payments`,
        `SELECT external_id FROM payments`,
        `SELECT * FROM payments`,
        `SELECT request_payload FROM invoice_provider_links`,
        `SELECT external_url FROM invoice_provider_links`,
        `SELECT * FROM user_activations`,
        `SELECT * FROM invoice_customers`,
        `SELECT * FROM neon_auth.session`,
        `SELECT pg_read_file('/etc/passwd')`,
        `SELECT pg_ls_dir('.')`,
      ]) {
        expect(await denied(lucy, sql), sql).toMatch(/permission denied/);
      }

      // read-only zapnuté: zápis odmítne už transakce
      expect(await denied(lucy, `INSERT INTO organizations (id, ico, name, registered_address) VALUES (gen_random_uuid(), '2', 'X', 'Y')`)).toMatch(
        /read-only transaction|permission denied/
      );

      // role si read-only SAMA VYPNE — pak drží granty
      await lucy.query(`SET default_transaction_read_only = off`);
      await lucy.query(`SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE`);
      expect((await lucy.query(`SHOW transaction_read_only`)).rows[0].transaction_read_only).toBe("off");
      for (const sql of [
        `INSERT INTO organizations (id, ico, name, registered_address) VALUES (gen_random_uuid(), '2', 'X', 'Y')`,
        `UPDATE organizations SET name = 'Z'`,
        `DELETE FROM organizations`,
        `TRUNCATE organizations`,
        `UPDATE payments SET note = 'x'`,
        `CREATE TABLE public.lucy_pokus (id int)`,
        `CREATE SCHEMA lucy_pokus`,
        `CREATE VIEW public.lucy_pohled AS SELECT 1`,
        `CREATE FUNCTION public.lucy_f() RETURNS int LANGUAGE sql AS 'SELECT 1'`,
        `ALTER TABLE organizations ADD COLUMN x int`,
        `DROP TABLE organizations`,
        `COPY organizations TO PROGRAM 'cat'`,
        `COPY organizations FROM '/etc/passwd'`,
        `ALTER ROLE lucy_readonly CREATEROLE`,
        `CREATE ROLE lucy_dalsi`,
      ]) {
        expect(await denied(lucy, sql), sql).toMatch(/permission denied|must be owner|must be superuser|only roles with|not allowed/);
      }
      // GRANT bez grant option skončí jen varováním „no privileges were
      // granted“ — ověřit, že se práva opravdu nezměnila
      const aclBefore = (await owner.query(`SELECT relacl::text AS a FROM pg_class WHERE oid = 'public.organizations'::regclass`)).rows[0].a;
      await lucy.query(`GRANT SELECT ON organizations TO PUBLIC`);
      await lucy.query(`GRANT SELECT ON organizations TO neon_auth`);
      expect((await owner.query(`SELECT relacl::text AS a FROM pg_class WHERE oid = 'public.organizations'::regclass`)).rows[0].a).toBe(aclBefore);

      // sekvence (číslování objednávek apod.) nejdou posunout
      const sequences = (await owner.query(`SELECT relname FROM pg_class WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace`)).rows;
      for (const { relname } of sequences) {
        expect(await denied(lucy, `SELECT nextval('public.${relname}')`)).toMatch(/permission denied/);
      }

      // ZNÁMÉ CHOVÁNÍ: role si smí TRVALE změnit vlastní výchozí nastavení
      // (ALTER ROLE … SET) — default_transaction_read_only tedy NENÍ tvrdá
      // ochrana; tvrdou ochranou jsou granty (ověřeno výš i níž).
      await lucy.query(`ALTER ROLE lucy_readonly SET default_transaction_read_only = off`);
      const lucyNew = await connect(urlFor("lucy_readonly", LUCY_PASSWORD, "neondb"));
      expect((await lucyNew.query(`SHOW default_transaction_read_only`)).rows[0].default_transaction_read_only).toBe("off");
      expect(await denied(lucyNew, `DELETE FROM organizations`)).toMatch(/permission denied/);
      expect(await denied(lucyNew, `CREATE TABLE public.lucy_pokus (id int)`)).toMatch(/permission denied/);
      await lucyNew.end();

      // ZBYTKOVÉ RIZIKO (zdokumentované): po vypnutí read-only smí role přes
      // PUBLIC/TEMP založit dočasnou tabulku jen ve své relaci a velký objekt.
      // Obchodní data tím nezmění. Úplná ochrana = Neon read replica.
      await lucy.query(`CREATE TEMP TABLE lucy_docasna (id int)`);
      await lucy.query(`SELECT lo_create(0)`);
    } finally {
      await lucy.end();
    }

    // přesné sloupcové granty
    const columns = async (table: string) =>
      (
        await owner.query(
          `SELECT column_name FROM information_schema.column_privileges WHERE grantee = 'lucy_readonly' AND table_name = $1 ORDER BY 1`,
          [table]
        )
      ).rows.map((r: { column_name: string }) => r.column_name);
    expect(await columns("payments")).toEqual(
      ["amount_hal", "created_at", "currency", "direction", "id", "match_status", "method", "note", "occurred_at", "order_id", "recorded_by_user_id", "refund_of_payment_id", "source", "status", "superseded_by_payment_id", "updated_at", "vs"].sort()
    );
    expect(await columns("invoice_provider_links")).toEqual(
      ["created_at", "external_number", "id", "invoice_id", "issued_at", "number_series", "provider", "state", "updated_at"].sort()
    );
    // žádná SECURITY DEFINER funkce, na kterou by role dosáhla
    expect(
      (
        await owner.query(`
          SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
            AND has_function_privilege('lucy_readonly', p.oid, 'EXECUTE')`)
      ).rows[0].n
    ).toBe(0);

    // volitelné zpřísnění: bez TEMP pro PUBLIC už dočasnou tabulku nezaloží
    const su = await connect(urlFor("postgres", new URL(ADMIN_URL!).password, "neondb"));
    await su.query(`REVOKE TEMPORARY ON DATABASE neondb FROM PUBLIC`);
    await su.end();
    const lucy2 = await connect(urlFor("lucy_readonly", LUCY_PASSWORD, "neondb"));
    await lucy2.query(`SET default_transaction_read_only = off`);
    expect(await denied(lucy2, `CREATE TEMP TABLE lucy_docasna (id int)`)).toMatch(/permission denied/);
    await lucy2.end();

    // návrat pod vlastníkem databáze: role zmizí i s velkým objektem, který založila
    await owner.query(file("39_production_readonly_role_rollback.sql").split("-- Kontrola: musí vrátit 0")[0]);
    expect((await owner.query(`SELECT count(*)::int AS n FROM pg_roles WHERE rolname = 'lucy_readonly'`)).rows[0].n).toBe(0);
    expect((await owner.query(`SELECT count(*)::int AS n FROM pg_largeobject_metadata`)).rows[0].n).toBe(0);
    await owner.end();
  });
});

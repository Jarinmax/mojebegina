// scripts/migrate-meta-leady.mjs — hlídaná migrace 0045 (meta_lead_imports)
// přes ovladač Neonu nad PGlite se stavem produkce (migrace až po 0044).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { runMetaLeadsMigration } from "../migrate-meta-leady.mjs";

const DASHBOARD_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DRIZZLE_DIR = join(DASHBOARD_ROOT, "drizzle");
const PRODUCTION_TIMELINE = "70a96b3677653646e65343cae8e27182";
const DATABASE_URL = "postgresql://u:p@ep-test.neon.tech/neondb";

type JournalEntry = { idx: number; tag: string };

function journalTags(maxIdx?: number): string[] {
  const journal: { entries: JournalEntry[] } = JSON.parse(readFileSync(join(DRIZZLE_DIR, "meta/_journal.json"), "utf8"));
  return journal.entries.filter((e) => maxIdx === undefined || e.idx <= maxIdx).map((e) => e.tag);
}

async function seedPg(maxIdx?: number): Promise<PGlite> {
  const pg = new PGlite();
  for (const tag of journalTags(maxIdx)) {
    for (const statement of readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await pg.exec(statement);
    }
  }
  return pg;
}

const RAW = Object.fromEntries(Array.from({ length: 20000 }, (_, oid) => [oid, (value: unknown) => value]));

type NeonQuery = { query: string; params?: unknown[] };

async function runQuery(pg: PGlite, { query, params }: NeonQuery) {
  const result = await pg.query(query, params ?? [], { rowMode: "array", parsers: RAW });
  return {
    fields: result.fields.map((field) => ({ name: field.name, dataTypeID: field.dataTypeID })),
    rows: result.rows,
    rowCount: result.affectedRows ?? result.rows.length,
    command: query.trim().split(/\s+/)[0].toUpperCase(),
  };
}

// Stejná pojistka proti souběhu jako v neon-http-pglite.mjs — PGlite má
// jediné spojení, @neondatabase/serverless ale posílá transakci/batch jako
// vlastní HTTP požadavek; bez fronty by souběžné volání prokládalo příkazy.
function mockNeonFetch(pg: PGlite): () => void {
  let queue = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task, task);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/^https:\/\/api\.[^/]*neon\.tech\/sql$/.test(url)) return realFetch(input, init);
    return exclusive(async () => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      try {
        let payload;
        if (Array.isArray(body.queries)) {
          await pg.exec("BEGIN");
          try {
            const results = [];
            for (const q of body.queries) results.push(await runQuery(pg, q));
            await pg.exec("COMMIT");
            payload = { results };
          } catch (error) {
            await pg.exec("ROLLBACK");
            throw error;
          }
        } else {
          payload = await runQuery(pg, body);
        }
        return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ message, code: (error as { code?: string }).code }), { status: 400 });
      }
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}

const IDX_0044 = journalTags().indexOf("0044_mereni_eshopu");
const hasTable = async (pg: PGlite) =>
  (await pg.query<{ present: boolean }>(`SELECT to_regclass('public.meta_lead_imports') IS NOT NULL AS present`)).rows[0].present;

describe("scripts/migrate-meta-leady.mjs", { timeout: 60_000 }, () => {
  let restoreFetch: (() => void) | undefined;
  let originalEnv: { VERCEL_ENV: string | undefined; DATABASE_URL: string | undefined };

  beforeEach(() => {
    originalEnv = { VERCEL_ENV: process.env.VERCEL_ENV, DATABASE_URL: process.env.DATABASE_URL };
  });
  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
    if (originalEnv.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalEnv.VERCEL_ENV;
    if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnv.DATABASE_URL;
  });

  it("mimo Vercel nic nedělá", async () => {
    delete process.env.VERCEL_ENV;
    await expect(runMetaLeadsMigration()).resolves.toBeUndefined();
  });

  it("produkce (po 0044): založí tabulku, podruhé nic; výsledek = schéma kódu po 0045", async () => {
    const pg = await seedPg(IDX_0044);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "production";
    process.env.DATABASE_URL = DATABASE_URL;
    expect(await hasTable(pg)).toBe(false);
    await runMetaLeadsMigration();
    expect(await hasTable(pg)).toBe(true);
    await runMetaLeadsMigration();

    const cols = async (db: PGlite) =>
      (await db.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'meta_lead_imports' ORDER BY column_name`)).rows;
    const full = await seedPg();
    expect(await cols(pg)).toEqual(await cols(full));
  });

  it("Preview build nad produkční databází nic nezmění", async () => {
    const pg = await seedPg(IDX_0044);
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_TIMELINE}'`);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = DATABASE_URL;
    await runMetaLeadsMigration();
    expect(await hasTable(pg)).toBe(false);
  });
});

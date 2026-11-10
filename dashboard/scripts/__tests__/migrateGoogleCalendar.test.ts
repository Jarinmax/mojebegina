// scripts/migrate-google-calendar.mjs — hlídané migrace 0035/0036 a převod
// starých termínů „jen datum“ (12:00 UTC → 09:00 Europe/Prague) při buildu
// na Vercelu. Stejná cesta jako v produkci: každý úsek zvlášť přes
// @neondatabase/serverless, přesměrovaný na PGlite se stavem dnešní produkce
// (migrace až po 0034).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { runGoogleCalendarMigration, CALENDAR_TABLES } from "../migrate-google-calendar.mjs";

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

const LEAD_DATE_ONLY = "00000000-0000-4000-8000-0000000000c1";
const LEAD_SUMMER = "00000000-0000-4000-8000-0000000000c2";
const LEAD_NONE = "00000000-0000-4000-8000-0000000000c3";
const IDX_0034 = journalTags().indexOf("0034_eshop_fakturacni_udaje");

async function productionLike(): Promise<PGlite> {
  const pg = await seedPg(IDX_0034);
  // stejně jako dnes v produkci: termín „jen datum“ uložený jako 12:00 UTC (zima i léto)
  await pg.exec(`INSERT INTO leads (id, company_name, source, stage, next_follow_up_at) VALUES
    ('${LEAD_DATE_ONLY}', 'Zimní termín', 'existing_database', 'contacted', '2026-11-12T12:00:00Z'),
    ('${LEAD_SUMMER}', 'Letní termín', 'existing_database', 'callback_later', '2027-06-15T12:00:00Z'),
    ('${LEAD_NONE}', 'Bez termínu', 'existing_database', 'new', NULL)`);
  return pg;
}

const followUps = async (pg: PGlite) =>
  (await pg.query<{ id: string; at: string | null }>(`SELECT id, to_char(next_follow_up_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD HH24:MI') AS at FROM leads ORDER BY id`)).rows;

describe("scripts/migrate-google-calendar.mjs — hlídané migrace při Vercel buildu", { timeout: 60_000 }, () => {
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

  it("mimo Vercel nic nedělá, i bez DATABASE_URL", async () => {
    delete process.env.VERCEL_ENV;
    delete process.env.DATABASE_URL;
    await expect(runGoogleCalendarMigration()).resolves.toBeUndefined();
  });

  it("stav produkce: 0035 + převod termínů na 09:00 + 0036; podruhé beze změny", async () => {
    const pg = await productionLike();
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = DATABASE_URL;

    await runGoogleCalendarMigration();

    expect(await followUps(pg)).toEqual([
      { id: LEAD_DATE_ONLY, at: "2026-11-12 09:00" },
      { id: LEAD_SUMMER, at: "2027-06-15 09:00" },
      { id: LEAD_NONE, at: null },
    ]);
    const { rows: backup } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM lead_follow_up_k8_backup`);
    expect(backup[0].n).toBe(2);
    const { rows: tables } = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [CALENDAR_TABLES]
    );
    expect(tables[0].n).toBe(2);
    const { rows: col } = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'daily_call_queue' AND column_name = 'resulting_activity_id'`
    );
    expect(col[0].n).toBe(1);

    // druhý build: nic se nepřevádí znovu (termín s časem nový kód mezitím uložil)
    await pg.exec(`UPDATE leads SET next_follow_up_at = '2026-11-12T13:30:00Z' WHERE id = '${LEAD_DATE_ONLY}'`);
    await runGoogleCalendarMigration();
    expect((await followUps(pg))[0]).toEqual({ id: LEAD_DATE_ONLY, at: "2026-11-12 14:30" });
  });

  it("výsledné schéma = schéma kódu (všechny migrace)", async () => {
    const pg = await productionLike();
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = DATABASE_URL;
    await runGoogleCalendarMigration();
    const print = async (db: PGlite) =>
      (await db.query<{ k: string }>(`
        SELECT 'col ' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable AS k FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'lead_follow_up_k8_backup'
        UNION ALL SELECT 'con ' || conrelid::regclass || ' ' || conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conrelid::regclass::text <> 'lead_follow_up_k8_backup'
        ORDER BY 1`)).rows.map((r) => r.k);
    const code = await seedPg();
    expect(await print(pg)).toEqual(await print(code));
  });

  it("částečné schéma (jen jedna z tabulek) → STOP, nic se nezmění", async () => {
    const pg = await productionLike();
    await pg.exec(`CREATE TABLE google_calendar_connections (id uuid PRIMARY KEY)`);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "production";
    process.env.DATABASE_URL = DATABASE_URL;
    await expect(runGoogleCalendarMigration()).rejects.toThrow(/partial schema/);
    expect((await followUps(pg))[0]).toEqual({ id: LEAD_DATE_ONLY, at: "2026-11-12 13:00" });
  });

  it("Preview build nad produkční databází nic nezmění", async () => {
    const pg = await productionLike();
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_TIMELINE}'`);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = DATABASE_URL;
    await runGoogleCalendarMigration();
    const { rows } = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [CALENDAR_TABLES]
    );
    expect(rows[0].n).toBe(0);
  });
});

// scripts/migrate-sklad.mjs — hlídané migrace 0028/0029/0030 při buildu na
// Vercelu (Preview i Production). Tohle je PRÁVĚ TA cesta, kterou žádný
// jiný test v repozitáři nespouští — docs/sklad/skladProductionSql.test.ts
// ověřuje jen ruční SQL vložené najednou (Neon SQL Editor), kde na
// "--> statement-breakpoint" nezáleží (je to jen komentář). Tenhle skript
// ale každý úsek posílá zvlášť přes @neondatabase/serverless (jeden úsek =
// jeden prepared statement) — chybějící breakpoint mezi dvěma za sebou
// jdoucími příkazy tu spadne s "cannot insert multiple commands into a
// prepared statement", zatímco ve 12/skladProductionSql.test.ts projde bez
// povšimnutí. Přesně tahle mezera pustila do PR #56 reálně rozbitý Preview
// build (Vercel status "Error") — viz oprava v 0028_sklad_1_0_zaklad.sql.
//
// Nad PGlite, stejný princip přesměrování @neondatabase/serverless na
// PGlite jako scripts/eshop-e2e/neon-http-pglite.mjs, ale se stavem
// zaseknutým PŘESNĚ na zvolené migraci (ne vždy na poslední), aby šlo
// otestovat každou fázi (0028/0029/0030) zvlášť, i kombinace.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { runSkladMigration, SKLAD_1_1_TABLES, SKLAD_TABLES } from "../migrate-sklad.mjs";

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

describe("scripts/migrate-sklad.mjs — hlídané migrace při Vercel buildu", { timeout: 60_000 }, () => {
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

  it("mimo Vercel (lokálně, v testech) nic nedělá, i bez DATABASE_URL", async () => {
    delete process.env.VERCEL_ENV;
    delete process.env.DATABASE_URL;
    await expect(runSkladMigration()).resolves.toBeUndefined();
  });

  it("na Preview/Production bez DATABASE_URL vyhodí jasnou chybu", async () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.DATABASE_URL;
    await expect(runSkladMigration()).rejects.toThrow(/DATABASE_URL/);
  });

  it("čerstvá větev (schéma Production 0027, bez skladu): 0028+0029+0030 se aplikují v JEDNÉ transakci; podruhé beze změny", async () => {
    const pg = await seedPg(27);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = DATABASE_URL;

    await runSkladMigration();

    const { rows } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
      [SKLAD_TABLES]
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual([...SKLAD_TABLES].sort());
    const { rows: rows11 } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
      [SKLAD_1_1_TABLES]
    );
    expect(rows11.map((r) => r.table_name).sort()).toEqual([...SKLAD_1_1_TABLES].sort());
    const [{ count }] = (await pg.query<{ count: number }>(`select count(*)::int as count from stock_locations where code = 'default'`))
      .rows;
    expect(count).toBe(1);

    // Druhé spuštění nad STEJNOU databází (další build) — žádná další
    // změna, žádná chyba, jen informativní hláška.
    await expect(runSkladMigration()).resolves.toBeUndefined();
    const [{ count: countAfter }] = (await pg.query<{ count: number }>(`select count(*)::int as count from stock_locations`)).rows;
    expect(countAfter).toBe(1);
  });

  it("Preview, co ukazuje na PRODUKČNÍ databázi (timeline produkce) — nic se nezmění", async () => {
    const pg = await seedPg(27);
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_TIMELINE}'`);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = DATABASE_URL;

    await runSkladMigration();

    const { rows } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
      [SKLAD_TABLES]
    );
    expect(rows).toHaveLength(0);
  });

  it("částečné schéma (jen jedna skladová tabulka) → STOP, chyba, nic dalšího se neaplikuje", async () => {
    const pg = await seedPg(27);
    await pg.exec(`CREATE TABLE suppliers (id text primary key, name text not null)`);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "production";
    process.env.DATABASE_URL = DATABASE_URL;

    await expect(runSkladMigration()).rejects.toThrow(/partial schema/);

    const { rows } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
      [SKLAD_TABLES]
    );
    expect(rows.map((r) => r.table_name)).toEqual(["suppliers"]);
  });

  it("0028, 0029 i 0030 už hotové (plný řetězec) — spuštění nic nemění a nehlásí jako nové", async () => {
    const pg = await seedPg(undefined);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "production";
    process.env.DATABASE_URL = DATABASE_URL;

    await expect(runSkladMigration()).resolves.toBeUndefined();
  });

  it("jen 0028 hotovo (starší nasazení bez 0029 i 0030) → doplní 0029 i 0030 v jedné transakci", async () => {
    const pg = await seedPg(28);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "production";
    process.env.DATABASE_URL = DATABASE_URL;

    await runSkladMigration();

    const [{ has0029 }] = (
      await pg.query<{ has0029: boolean }>(
        `select count(*)::int > 0 as has0029 from information_schema.columns
           where table_schema = 'public' and table_name = 'goods_receipts' and column_name = 'reextraction_status'`
      )
    ).rows;
    expect(has0029).toBe(true);
    const { rows: rows11 } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
      [SKLAD_1_1_TABLES]
    );
    expect(rows11.map((r) => r.table_name).sort()).toEqual([...SKLAD_1_1_TABLES].sort());
  });

  it("0028 + 0029 hotovo, 0030 chybí (starší nasazení před Sklad 1.1) → doplní jen 0030", async () => {
    const pg = await seedPg(29);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "production";
    process.env.DATABASE_URL = DATABASE_URL;

    await runSkladMigration();

    const { rows: rows11 } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
      [SKLAD_1_1_TABLES]
    );
    expect(rows11.map((r) => r.table_name).sort()).toEqual([...SKLAD_1_1_TABLES].sort());

    // Druhé spuštění — beze změny, jen "už hotovo".
    await expect(runSkladMigration()).resolves.toBeUndefined();
  });

  it("částečné schéma 0030 (jen stock_batches, bez stock_reservations) → STOP, nic dalšího se neaplikuje", async () => {
    const pg = await seedPg(29);
    await pg.exec(`CREATE TABLE stock_batches (id uuid primary key default gen_random_uuid())`);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "production";
    process.env.DATABASE_URL = DATABASE_URL;

    await expect(runSkladMigration()).rejects.toThrow(/partial schema detected for 0030/);

    const { rows: rows11 } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
      [SKLAD_1_1_TABLES]
    );
    expect(rows11.map((r) => r.table_name)).toEqual(["stock_batches"]);
  });
});

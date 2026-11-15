// scripts/migrate-jarda-karta.mjs — migrace 0040 a jednorázový úklid dat
// Jardovy karty (audit 15. 11. 2026) přes ovladač Neonu nad PGlite se stavem
// produkce (migrace až po 0039) a se stejnými záznamy jako v produkci.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  runJardaCardMigration,
  BLAHOUT,
  VINER,
  JARDA_CARD_ID,
  LEAD_TATIANA,
  ORG_VIP_DOGS,
  LEAD_MONIKA,
  ORDER_MONIKA,
  LEAD_VINER_JOKE,
} from "../migrate-jarda-karta.mjs";

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

const IDX_0039 = journalTags().indexOf("0039_denni_volani_1_1_historie");

async function productionLike(): Promise<PGlite> {
  const pg = await seedPg(IDX_0039);
  await pg.exec(`
    INSERT INTO organizations (id, ico, name, registered_address, owner_user_id, acquired_by_user_id)
      VALUES ('${ORG_VIP_DOGS}', '08760381', 'VIP Dogs', 'Praha 6', '${BLAHOUT}', '${BLAHOUT}');
    INSERT INTO leads (id, contact_name, source, stage, owner_user_id) VALUES
      ('${LEAD_TATIANA}', 'Tatiana Lisichkina', 'existing_database', 'interested', '${BLAHOUT}'),
      ('${LEAD_MONIKA}', 'Monika Chuda', 'existing_database', 'callback_later', '${BLAHOUT}'),
      ('${LEAD_VINER_JOKE}', 'Jaroslav Viner', 'existing_database', 'new', '${BLAHOUT}');
    INSERT INTO orders (id, buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status, ordered_at, contact_email, contact_name, channel, order_number, payment_vs)
      VALUES ('${ORDER_MONIKA}', NULL, 199, 267, 466, 'paid', '2026-11-13T09:00:00Z', 'monika@example.cz', 'Monika Chuda', 'eshop', 70000013, '70000013');
  `);
  return pg;
}

const state = async (pg: PGlite) => ({
  leads: (await pg.query(`SELECT id, stage, owner_user_id, converted_organization_id FROM leads ORDER BY id`)).rows,
  order: (await pg.query(`SELECT source_lead_id FROM orders WHERE id = '${ORDER_MONIKA}'`)).rows,
  cards: (await pg.query(`SELECT id, assignee_user_id, display_name FROM collaborator_cards WHERE id = '${JARDA_CARD_ID}'`)).rows,
  activity: (await pg.query(`SELECT lead_id, kind, author_user_id, metadata->>'reason' AS reason FROM lead_activity ORDER BY lead_id, kind`)).rows,
  assignments: (await pg.query(`SELECT lead_id, reward_type, basis, recorded_at FROM seller_reward_assignments ORDER BY lead_id`)).rows,
});

describe("scripts/migrate-jarda-karta.mjs — úklid Jardovy karty při buildu", { timeout: 60_000 }, () => {
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
    delete process.env.DATABASE_URL;
    await expect(runJardaCardMigration()).resolves.toBeUndefined();
  });

  it("0040 + úklid: VIP Dogs ↔ Tatiana, objednávka ↔ Monika, lead „Jaroslav Viner“ → Viner, Jardova karta; podruhé beze změny", async () => {
    const pg = await productionLike();
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = DATABASE_URL;

    await runJardaCardMigration();
    const after = await state(pg);

    const byId = Object.fromEntries((after.leads as { id: string }[]).map((l) => [l.id, l]));
    expect(byId[LEAD_TATIANA]).toMatchObject({ stage: "converted", converted_organization_id: ORG_VIP_DOGS, owner_user_id: BLAHOUT });
    expect(byId[LEAD_MONIKA]).toMatchObject({ stage: "converted", converted_organization_id: null, owner_user_id: BLAHOUT });
    expect(byId[LEAD_VINER_JOKE]).toMatchObject({ stage: "new", owner_user_id: VINER });
    expect(after.order).toEqual([{ source_lead_id: LEAD_MONIKA }]);
    expect(after.cards).toEqual([{ id: JARDA_CARD_ID, assignee_user_id: BLAHOUT, display_name: "Jaroslav Blahout – obchod a volání" }]);
    expect(after.activity).toHaveLength(3);
    expect((after.assignments as { lead_id: string; reward_type: string; basis: string }[]).map((a) => [a.lead_id, a.reward_type, a.basis])).toEqual([
      [LEAD_TATIANA, "new", "confirmed_at_signing"],
      [LEAD_MONIKA, "new", "confirmed_at_signing"],
    ].sort());
    expect((after.activity as { reason: string }[]).every((a) => a.reason === "audit_2026_11_15")).toBe(true);
    const { rows: froms } = await pg.query<{ lead_id: string; from: string }>(`SELECT lead_id, metadata->>'from' AS from FROM lead_activity WHERE kind = 'converted' ORDER BY lead_id`);
    expect(Object.fromEntries(froms.map((r) => [r.lead_id, r.from]))).toEqual({ [LEAD_TATIANA]: "interested", [LEAD_MONIKA]: "callback_later" });

    await runJardaCardMigration();
    expect(await state(pg)).toEqual(after);
  });

  it("když záznamy v databázi nejsou (jiná větev), nic nespadne a nic nevznikne kromě karty", async () => {
    const pg = await seedPg(IDX_0039);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = DATABASE_URL;
    await runJardaCardMigration();
    const s = await state(pg);
    expect(s.leads).toEqual([]);
    expect(s.activity).toEqual([]);
    expect(s.assignments).toEqual([]);
    expect(s.cards).toHaveLength(1);
  });

  it("Preview build nad produkční databází nic nezmění", async () => {
    const pg = await productionLike();
    await pg.exec(`SET neon.timeline_id = '${PRODUCTION_TIMELINE}'`);
    restoreFetch = mockNeonFetch(pg);
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = DATABASE_URL;
    const before = (await pg.query(`SELECT id, stage, owner_user_id FROM leads ORDER BY id`)).rows;
    await runJardaCardMigration();
    expect((await pg.query(`SELECT id, stage, owner_user_id FROM leads ORDER BY id`)).rows).toEqual(before);
    const { rows } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'source_lead_id'`);
    expect(rows[0].n).toBe(0);
  });
});

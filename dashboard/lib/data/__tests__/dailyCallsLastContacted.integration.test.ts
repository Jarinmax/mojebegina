// Denní volání — karta ve frontě ukáže, kdy byl kontakt naposledy skutečně
// obvolaný (leads.last_contacted_at), aby Jarda nevolal znovu kontakt, co
// volal před pár dny, aniž by o tom appka cokoliv řekla (zadání 6. 11. 2026).
// Nad skutečným Postgresem (ovladač Neonu → PGlite se všemi migracemi).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  ctx: null as null | {
    userId: string; systemRole: string; grantedRoles: string[]; roleSelectionRequired: boolean; name: string | null; email: string;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ get db() { return holder.db; } }));
vi.mock("../authContext", () => ({ getAuthContext: async () => holder.ctx }));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const asViner = () => (holder.ctx = { userId: VINER, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "v@begina.cz" });

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NEVER_CALLED = id(1);
const CALLED_BEFORE = id(2);
const CALLED_AT = "2026-09-01T08:00:00Z";

describe("Denní volání — naposledy voláno na kartě fronty", { timeout: 120_000 }, () => {
  let dc: typeof import("../dailyCalls");
  let db: import("drizzle-orm/neon-http").NeonHttpDatabase<typeof import("@/lib/db/schema")>;

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    dc = await import("../dailyCalls");

    await db.execute(sql.raw(`
      INSERT INTO leads (id, company_name, contact_phone, source, stage, owner_user_id, last_contacted_at) VALUES
        ('${NEVER_CALLED}', 'Nikdy nevolaná firma', '+420 600 000 001', 'existing_database', 'new', '${BLAHOUT}', NULL),
        ('${CALLED_BEFORE}', 'Už dřív volaná firma', '+420 600 000 002', 'existing_database', 'new', '${BLAHOUT}', '${CALLED_AT}')`));
    await db.execute(sql.raw(`
      INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, metadata, created_at) VALUES
        ('${CALLED_BEFORE}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'Slíbil zavolat zpět.', '{"callResult":"reached_interested"}', '${CALLED_AT}')`));

    asViner();
    await dc.addManualCandidate(NEVER_CALLED);
    await dc.addManualCandidate(CALLED_BEFORE);
    await dc.publishDraft();
  });

  it("getCuratorQueueView: lastContactedAt odpovídá leads.last_contacted_at, null u nikdy nevolaného", async () => {
    asViner();
    const { published } = await dc.getCuratorQueueView();
    const never = published.find((c) => c.leadId === NEVER_CALLED);
    const before = published.find((c) => c.leadId === CALLED_BEFORE);
    expect(never?.lastContactedAt).toBeNull();
    expect(before?.lastContactedAt?.toISOString()).toBe(new Date(CALLED_AT).toISOString());
  });

  it("getWorkerQueueView (Jarda): vidí stejné datum posledního hovoru jako kurátor", async () => {
    holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" };
    const worker = await dc.getWorkerQueueView();
    const shown = [...worker.carriedOver, ...worker.today];
    const before = shown.find((c) => c.leadId === CALLED_BEFORE);
    expect(before?.lastContactedAt?.toISOString()).toBe(new Date(CALLED_AT).toISOString());
  });
});

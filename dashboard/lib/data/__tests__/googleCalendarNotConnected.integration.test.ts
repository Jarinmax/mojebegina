// Etapa 0 — Google Kalendář po nasazení, ale PŘED propojením účtu (stav
// Production hned po migraci 0025): zápis termínu nesmí nic hlásit jako
// chybu a dosynchronizace po propojení musí najít všechny aktivní termíny.
// Ovladač Neonu → PGlite se všemi migracemi (stejně jako agentFlow test).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const ACTIVE = "00000000-0000-4000-8000-0000000000a1";
const ACTIVE_PAST = "00000000-0000-4000-8000-0000000000a2";
const CONVERTED = "00000000-0000-4000-8000-0000000000a3";
const NO_DATE = "00000000-0000-4000-8000-0000000000a4";

describe("Google Kalendář bez propojení (Etapa 0)", { timeout: 120_000 }, () => {
  let db: import("drizzle-orm/neon-http").NeonHttpDatabase<typeof import("@/lib/db/schema")>;
  let gc: typeof import("../googleCalendar");

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    gc = await import("../googleCalendar");
    await db.execute(sql.raw(`
      INSERT INTO leads (id, source, company_name, stage, next_follow_up_at) VALUES
        ('${ACTIVE}', 'existing_database', 'A', 'contacted', '2026-11-02T08:00:00Z'),
        ('${ACTIVE_PAST}', 'existing_database', 'B', 'callback_later', '2026-10-01T10:00:00Z'),
        ('${CONVERTED}', 'existing_database', 'C', 'converted', '2026-11-02T08:00:00Z'),
        ('${NO_DATE}', 'existing_database', 'D', 'new', NULL)`));
  });

  const syncRows = async () =>
    (
      await db.execute<{ lead_id: string; sync_status: string; last_error: string | null }>(
        sql`SELECT lead_id, sync_status, last_error FROM lead_calendar_sync ORDER BY lead_id`
      )
    ).rows;

  it("reconcile bez propojení nechá 'pending' a nezapíše chybu", async () => {
    await gc.upsertPendingLeadCalendarSync(ACTIVE);
    await gc.reconcileLeadCalendarEvent(ACTIVE);
    expect(await syncRows()).toEqual([{ lead_id: ACTIVE, sync_status: "pending", last_error: null }]);
  });

  it("dosynchronizace najde aktivní leady s termínem (i bez řádku synchronizace), ostatní přeskočí", async () => {
    const { processed } = await gc.resyncAllLeadCalendarEvents();
    expect(processed).toBe(2);
    expect(await syncRows()).toEqual([
      { lead_id: ACTIVE, sync_status: "pending", last_error: null },
      { lead_id: ACTIVE_PAST, sync_status: "pending", last_error: null },
    ]);
  });
});

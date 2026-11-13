// Jarda — upozornění na naplánovaný hovor 1.0. getScheduledCallsGroupedByOwnerToday
// je výhradní zdroj dat pro denní cron (app/api/cron/daily-call-reminders) —
// bez requireCrmContext (cron nemá session), proto testováno zvlášť, ne
// společně s uživatelskými funkcemi v leads.ts. Nad skutečným Postgresem
// (ovladač Neonu → PGlite se všemi migracemi), stejný princip jako
// dailyCallsLastContacted.integration.test.ts.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ get db() { return holder.db; } }));

const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TODAY_EARLY = id(1); // Blahout, dnes 10:00 UTC
const TODAY_LATE = id(2); // Blahout, dnes 12:00 UTC (musí být až za TODAY_EARLY)
const YESTERDAY = id(3); // Blahout, jiný den — nesmí se objevit
const NO_TIME = id(4); // Blahout, next_follow_up_at NULL — nesmí se objevit
const CONVERTED = id(5); // Blahout, stage converted — nesmí se objevit
const OTHER_OWNER = id(6); // Viner, dnes — vlastní skupina

// Pevné "teď" (CEST, UTC+2) — den 2026-06-10 v Praze.
const NOW = new Date("2026-06-10T10:00:00.000Z");

describe("getScheduledCallsGroupedByOwnerToday — Jarda, upozornění na naplánovaný hovor", { timeout: 120_000 }, () => {
  let mod: typeof import("../scheduledCallReminders");

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    const db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    mod = await import("../scheduledCallReminders");

    await db.execute(sql.raw(`
      INSERT INTO leads (id, company_name, contact_phone, source, stage, owner_user_id, next_follow_up_at) VALUES
        ('${TODAY_EARLY}', 'Kavárna Ráno', '+420 600 000 001', 'existing_database', 'new', '${BLAHOUT}', '2026-06-10T10:00:00Z'),
        ('${TODAY_LATE}', 'Bistro Poledne', '+420 600 000 002', 'existing_database', 'new', '${BLAHOUT}', '2026-06-10T12:00:00Z'),
        ('${YESTERDAY}', 'Firma Včera', '+420 600 000 003', 'existing_database', 'new', '${BLAHOUT}', '2026-06-09T10:00:00Z'),
        ('${NO_TIME}', 'Firma Beze Času', '+420 600 000 004', 'existing_database', 'new', '${BLAHOUT}', NULL),
        ('${CONVERTED}', 'Firma Konvertovaná', '+420 600 000 005', 'existing_database', 'converted', '${BLAHOUT}', '2026-06-10T09:00:00Z'),
        ('${OTHER_OWNER}', 'Firma Vinerova', '+420 600 000 006', 'existing_database', 'new', '${VINER}', '2026-06-10T08:00:00Z')`));
  });

  it("vrátí jen dnešní (Europe/Prague) aktivní hovory, seřazené podle času, po vlastnících", async () => {
    const grouped = await mod.getScheduledCallsGroupedByOwnerToday(NOW);

    const blahout = grouped.get(BLAHOUT);
    expect(blahout?.map((c) => c.leadId)).toEqual([TODAY_EARLY, TODAY_LATE]);
    expect(blahout?.[0].displayName).toBe("Kavárna Ráno");
    expect(blahout?.[0].contactPhone).toBe("+420 600 000 001");

    const viner = grouped.get(VINER);
    expect(viner?.map((c) => c.leadId)).toEqual([OTHER_OWNER]);

    expect(grouped.size).toBe(2);
  });

  it("jiný den, bez času, nebo konvertovaný lead se do výsledku nedostanou", async () => {
    const grouped = await mod.getScheduledCallsGroupedByOwnerToday(NOW);
    const allIds = [...grouped.values()].flat().map((c) => c.leadId);
    expect(allIds).not.toContain(YESTERDAY);
    expect(allIds).not.toContain(NO_TIME);
    expect(allIds).not.toContain(CONVERTED);
  });
});

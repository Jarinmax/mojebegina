// Etapa 0 (ETAPA0_INTEGRACE_VETVI.md, rozhodnutí 3 a 6) — pravidla termínu
// dalšího kontaktu v Denním volání nad skutečným Postgresem (PGlite se
// všemi migracemi), ne jen nad textem SQL:
//   • nevyplněný termín zachová stávající,
//   • smazání jen výslovně (clearFollowUp),
//   • nový termín přepíše starý,
//   • do lead_calendar_sync jde ve stejné operaci 'pending'.
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createMigratedDb } from "../../eshop/__tests__/helpers/migratedDb";
import { buildLogDailyCallOutcomeQuery } from "../dailyCallsValidation";

const LEAD = "22222222-2222-4222-8222-222222222222";
const USER = "06240ac4-c050-47ea-998c-6c81389edf9f";
const OLD = "2026-11-02T08:00:00.000Z";

let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
let seq = 0;

async function queueItem(): Promise<string> {
  seq += 1;
  const id = `11111111-1111-4111-8111-${String(seq).padStart(12, "0")}`;
  await db.execute(sql`
    INSERT INTO daily_call_queue (id, lead_id, position, status, source, added_by, added_for_date, published_at, published_by)
    VALUES (${id}, ${LEAD}, 1, 'pending', 'manual', ${USER}, '2026-10-26', now(), ${USER})`);
  return id;
}

async function log(itemId: string, nextFollowUpAt: Date | null, clearFollowUp = false) {
  const res = await db.execute(
    buildLogDailyCallOutcomeQuery({
      itemId,
      leadId: LEAD,
      authorUserId: USER,
      authorName: "Jaroslav Blahout",
      activityId: crypto.randomUUID(),
      note: "Hovor",
      stageChange: null,
      nextFollowUpAt,
      clearFollowUp,
      result: "no_answer",
    })
  );
  return res.rows.length;
}

async function followUp(): Promise<string | null> {
  const res = await db.execute<{ v: Date | string | null }>(sql`SELECT next_follow_up_at AS v FROM leads WHERE id = ${LEAD}`);
  const v = res.rows[0].v;
  return v === null ? null : new Date(v).toISOString();
}

describe("Denní volání — termín dalšího kontaktu nad skutečnou DB (Etapa 0)", { timeout: 120_000 }, () => {
  beforeEach(async () => {
    ({ db } = await createMigratedDb());
    await db.execute(sql`
      INSERT INTO leads (id, source, company_name, stage, next_follow_up_at)
      VALUES (${LEAD}, 'existing_database', 'Bistro Test', 'contacted', ${OLD})`);
  });

  it("nevyplněný termín zachová stávající", async () => {
    expect(await log(await queueItem(), null)).toBe(1);
    expect(await followUp()).toBe(OLD);
  });

  it("nový termín přepíše starý", async () => {
    await log(await queueItem(), new Date("2026-11-05T13:30:00.000Z"));
    expect(await followUp()).toBe("2026-11-05T13:30:00.000Z");
  });

  it("výslovné smazání termín smaže a zapíše followUpCleared do aktivity", async () => {
    await log(await queueItem(), null, true);
    expect(await followUp()).toBeNull();
    const res = await db.execute<{ m: Record<string, unknown> }>(
      sql`SELECT metadata AS m FROM lead_activity WHERE lead_id = ${LEAD} AND kind = 'call_logged'`
    );
    expect(res.rows[0].m).toMatchObject({ followUpCleared: true, callResult: "no_answer" });
  });

  it("zápis nastaví lead_calendar_sync na 'pending' ve stejné operaci", async () => {
    await log(await queueItem(), null);
    const res = await db.execute<{ s: string }>(sql`SELECT sync_status AS s FROM lead_calendar_sync WHERE lead_id = ${LEAD}`);
    expect(res.rows).toEqual([{ s: "pending" }]);
  });
});

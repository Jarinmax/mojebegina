// @vitest-environment node
//
// Security Phase 21 (Denní volání 1.1) — post-implementation audit, bod 3.
// Stejná mock technika jako dailyCallsWorkerIsolation.test.ts (stub
// "server-only", nahradit @neondatabase/serverless transport špionem),
// ale cílí na logDailyCallOutcome() samo — SKUTEČNOU funkci, ne jen na
// text zkompilovaného SQL (to dokazuje
// dailyCallsValidation.test.ts > "resulting_activity_id (Security Phase
// 21)" už dřív).
//
// Co tenhle test dokazuje na reálné funkci:
//   - prohraný claim (atomický příkaz vrátí 0 řádků) → logDailyCallOutcome
//     vrátí {ok:false} a NEVOLÁ reconcileLeadCalendarEvent (žádný
//     vedlejší efekt po neúspěchu);
//   - úspěšný claim → zavolá reconcileLeadCalendarEvent přesně jednou se
//     správným leadId;
//   - dvě samostatná vyřízení STEJNÉHO leada (dva různé itemId) generují
//     dvě ODLIŠNÉ hodnoty activityId a každé z nich se použije jak pro
//     `resulting_activity_id`, tak pro `id` vkládané aktivity VE STEJNÉM
//     volání — žádné křížení mezi voláními.
//
// Co tenhle test NEMŮŽE dokázat (a nepředstírá, že může): `ON DELETE SET
// NULL` je garance databázového enginu, ne aplikační logiky — ověřuje se
// až živým DELETE proti reálné databázi s aplikovanou migrací (viz
// hlášení k bodu 4 auditu: blokováno, dokud není bezpečně potvrzená
// Preview DB). Staticky je ale potvrzeno: schema.ts
// (`.references(() => leadActivity.id, { onDelete: "set null" })`) i
// vygenerovaná migrace 0014 (`ON DELETE SET NULL`) obsahují přesně tuhle
// klauzuli.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../types";

vi.mock("server-only", () => ({}));

type CapturedQuery = { sql: string; params: unknown[] };
const capturedQueries: CapturedQuery[] = [];

// Řídí, kolik řádků vrátí HLAVNÍ atomický příkaz (claimed CTE) — 0 =
// prohraný/souběžný claim, 1 = úspěch. Pre-check SELECT a reconcile
// dostávají vždy smysluplnou fixní odpověď, protože to NEJSOU věci, které
// tenhle test zkoumá.
let claimedRowCount = 1;
const TEST_LEAD_ID = "22222222-2222-2222-2222-222222222222";

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (sqlText: string, params: unknown[]) => {
    capturedQueries.push({ sql: sqlText, params });

    // Pre-check SELECT v logDailyCallOutcome: `.select({leadId, status})
    // .from(dailyCallQueue).where(eq(id, itemId)).limit(1)` — drizzle ho
    // kompiluje s "fields" metadaty, takže HTTP driver očekává řádky v
    // arrayMode (pole hodnot v pořadí select listu: leadId, status).
    if (sqlText.startsWith('select "lead_id", "status" from "daily_call_queue"')) {
      return Promise.resolve({ rows: [[TEST_LEAD_ID, "pending"]], rowCount: 1, fields: [] });
    }

    // Hlavní atomický CTE příkaz (buildLogDailyCallOutcomeQuery) — jde přes
    // db.execute(), tedy "raw"/object mode. RETURNING id má buď 0, nebo 1
    // řádek podle `claimedRowCount` — to je přesně to, co test řídí.
    if (sqlText.includes("WITH old_lead AS")) {
      const rows = claimedRowCount > 0 ? [{ id: "activity-row-id" }] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }

    return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
  },
}));

const mockGetAuthContext = vi.fn<() => Promise<AuthContext>>();
vi.mock("../authContext", () => ({ getAuthContext: () => mockGetAuthContext() }));

const mockReconcile = vi.fn<(leadId: string) => Promise<void>>(async () => {});
vi.mock("../googleCalendar", () => ({ reconcileLeadCalendarEvent: (leadId: string) => mockReconcile(leadId) }));

const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";

function workerCtx(): AuthContext {
  return {
    userId: BLAHOUT,
    systemRole: "EXECUTIVE",
    grantedRoles: ["EXECUTIVE"],
    roleSelectionRequired: false,
    name: "Jaroslav Blahout",
    email: "blahout@example.com",
  };
}

function findAtomicCall() {
  return capturedQueries.find((q) => q.sql.includes("WITH old_lead AS"));
}

// UUID-shaped values among a call's params — used to find the generated
// activityId without depending on its exact parameter position.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// leadId i authorUserId se v jednom volání taky opakují dvakrát
// (old_lead CTE + claimed WHERE; done_by + author_user_id) — vyloučeny,
// aby zbyl jen skutečně generovaný activityId.
function uuidParams(params: unknown[]): string[] {
  return params.filter(
    (p): p is string => typeof p === "string" && UUID_RE.test(p) && p !== TEST_LEAD_ID && p !== BLAHOUT
  );
}

beforeEach(() => {
  capturedQueries.length = 0;
  claimedRowCount = 1;
  mockGetAuthContext.mockReset();
  mockReconcile.mockClear();
});

describe("logDailyCallOutcome — atomická vazba na aktivitu (Security Phase 21, bod 3)", () => {
  it("prohraný/souběžný claim (0 řádků) → {ok:false} a ŽÁDNÝ reconcileLeadCalendarEvent", async () => {
    claimedRowCount = 0;
    mockGetAuthContext.mockResolvedValue(workerCtx());
    const { logDailyCallOutcome } = await import("../dailyCalls");

    const result = await logDailyCallOutcome("item-1", {
      result: "reached_interested",
      note: "Test",
      stageChange: "",
      nextFollowUpAtDate: "",
      nextFollowUpAtTime: "",
    });

    expect(result.ok).toBe(false);
    expect(mockReconcile).not.toHaveBeenCalled();

    // Atomický příkaz PROBĚHL (SQL se vyslalo), ale vrátil 0 řádků — gate
    // v `claimed` zabránil i vzniku lead_activity (součást TÉHOŽ příkazu,
    // viz WHERE EXISTS (SELECT 1 FROM claimed) ověřené staticky v
    // dailyCallsValidation.test.ts).
    expect(findAtomicCall()).toBeTruthy();
  });

  it("úspěšný claim → {ok:true} a reconcileLeadCalendarEvent zavolán přesně jednou se správným leadId", async () => {
    claimedRowCount = 1;
    mockGetAuthContext.mockResolvedValue(workerCtx());
    const { logDailyCallOutcome } = await import("../dailyCalls");

    const result = await logDailyCallOutcome("item-1", {
      result: "reached_interested",
      note: "Dovoláno, pošlu nabídku.",
      stageChange: "",
      nextFollowUpAtDate: "",
      nextFollowUpAtTime: "",
    });

    expect(result).toMatchObject({ ok: true, itemId: "item-1", note: "Dovoláno, pošlu nabídku." });
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledWith(TEST_LEAD_ID);
  });

  it("dvě vyřízení stejného leada (dva itemId) mají dvě ODLIŠNÉ activityId, každé správně navázané ve svém vlastním volání", async () => {
    claimedRowCount = 1;
    mockGetAuthContext.mockResolvedValue(workerCtx());
    const { logDailyCallOutcome } = await import("../dailyCalls");

    await logDailyCallOutcome("item-A", {
      result: "reached_interested",
      note: "První vyřízení.",
      stageChange: "",
      nextFollowUpAtDate: "",
      nextFollowUpAtTime: "",
    });
    const firstCall = findAtomicCall()!;
    capturedQueries.length = 0;

    await logDailyCallOutcome("item-B", {
      result: "no_answer",
      note: "Druhé vyřízení (stejný lead).",
      stageChange: "",
      nextFollowUpAtDate: "",
      nextFollowUpAtTime: "",
    });
    const secondCall = findAtomicCall()!;

    const firstUuids = uuidParams(firstCall.params);
    const secondUuids = uuidParams(secondCall.params);

    // V KAŽDÉM volání se stejné activityId použije aspoň dvakrát (jednou
    // pro resulting_activity_id v `claimed`, jednou pro id vkládané
    // aktivity) — FK tedy ukazuje přesně na aktivitu vytvořenou TÍMTO
    // konkrétním vyřízením.
    const firstActivityId = firstUuids.find((id) => firstUuids.filter((x) => x === id).length >= 2);
    const secondActivityId = secondUuids.find((id) => secondUuids.filter((x) => x === id).length >= 2);
    expect(firstActivityId).toBeTruthy();
    expect(secondActivityId).toBeTruthy();

    // A hlavní bod testu: mezi dvěma samostatnými vyřízeními stejného
    // leada se activityId nikdy neshoduje.
    expect(firstActivityId).not.toBe(secondActivityId);
  });
});

import { describe, expect, it } from "vitest";
import { describeLeadActivity, leadState } from "../agentLeadsValidation";
import { buildDailyCallReport, matchQueueItem, type QueueItemRow, type ReportCallRow } from "../dailyCallReportValidation";

describe("stav leadu podle kalendářního dne v Praze", () => {
  // termín se ukládá jako datum na 12:00 UTC
  const lead = (stage: string, date: string | null, note: string | null = null) => ({
    stage,
    nextFollowUpAt: date ? new Date(`${date}T12:00:00.000Z`) : null,
    nextStepNote: note,
  });

  it("po termínu až den po termínu, v den termínu „na dnes“", () => {
    expect(leadState(lead("contacted", "2026-10-17"), "2026-10-18")).toMatchObject({ overdue: true, dueToday: false });
    expect(leadState(lead("contacted", "2026-10-18"), "2026-10-18")).toMatchObject({ overdue: false, dueToday: true });
    expect(leadState(lead("contacted", "2026-10-19"), "2026-10-18")).toMatchObject({ overdue: false, dueToday: false });
  });

  it("ukončené leady nejsou po termínu ani bez dalšího kroku", () => {
    expect(leadState(lead("not_interested", "2026-10-01"), "2026-10-18")).toEqual({
      overdue: false,
      dueToday: false,
      missingNextStep: false,
      noFollowUpDate: false,
      closed: true,
    });
  });

  it("bez dalšího kroku = bez termínu i bez popisu", () => {
    expect(leadState(lead("new", null), "2026-10-18")).toMatchObject({ missingNextStep: true, noFollowUpDate: true });
    expect(leadState(lead("new", null, "Poslat ceník"), "2026-10-18")).toMatchObject({ missingNextStep: false, noFollowUpDate: true });
    expect(leadState(lead("new", null, "   "), "2026-10-18").missingNextStep).toBe(true);
  });
});

describe("popis historie leadu", () => {
  it("jen vybrané údaje, ne celá metadata", () => {
    expect(
      describeLeadActivity({
        kind: "call_logged",
        metadata: { callResult: "reached_interested", from: "new", stageChangedTo: "interested", nextFollowUpAt: "2026-10-20T12:00:00.000Z", tajne: "x" },
      })
    ).toEqual({ result: "Dovoláno – zájem", stageBefore: "Lead", stageChangedTo: "Zájem", nextContactDate: "2026-10-20" });
    expect(describeLeadActivity({ kind: "created", metadata: { importBatch: "crm-import-2026-09-26", sourceRow: 17 } })).toEqual({
      imported: "ano (import z tabulky)",
    });
    expect(describeLeadActivity({ kind: "call_logged", metadata: { nextFollowUpAt: "nesmysl" } }).nextContactDate).toBeNull();
    expect(describeLeadActivity({ kind: "neznamy", metadata: { a: 1 } })).toEqual({});
  });
});

describe("denní fronta: plán vs. zaznamenané hovory", () => {
  const item = (id: string, over: Partial<QueueItemRow> = {}): QueueItemRow => ({
    id,
    leadId: `L-${id}`,
    leadName: `Lead ${id}`,
    addedForDate: "2026-10-14",
    status: "pending",
    source: "auto",
    publishedAt: new Date("2026-10-14T05:00:00Z"),
    doneAt: null,
    doneBy: null,
    removedAt: null,
    ...over,
  });
  const call = (id: string, leadId: string, author: string, at: string, over: Partial<ReportCallRow> = {}): ReportCallRow => ({
    id,
    leadId,
    leadName: `Lead ${leadId}`,
    authorUserId: author,
    createdAt: new Date(at),
    body: "Poznámka",
    metadata: { callResult: "no_answer" },
    ...over,
  });

  it("spáruje dokončení s hovorem téhož leadu a autora do 10 minut", () => {
    const done = item("1", { status: "done", doneAt: new Date("2026-10-14T08:00:00Z"), doneBy: "blahout" });
    expect(matchQueueItem(done, [call("c1", "L-1", "blahout", "2026-10-14T08:00:00Z")])?.id).toBe("c1");
    expect(matchQueueItem(done, [call("c2", "L-1", "viner", "2026-10-14T08:00:00Z")])).toBeNull();
    expect(matchQueueItem(done, [call("c3", "L-1", "blahout", "2026-10-14T08:11:00Z")])).toBeNull();
    expect(matchQueueItem(done, [call("c4", "L-2", "blahout", "2026-10-14T08:00:00Z")])).toBeNull();
  });

  it("souhrn: plán, hotovo, čeká, odebráno, koncepty, nesoulady a hovory mimo frontu", () => {
    const planned = [
      item("1", { status: "done", doneAt: new Date("2026-10-14T08:00:00Z"), doneBy: "blahout" }),
      item("2"),
      item("3", { status: "removed", removedAt: new Date("2026-10-14T09:00:00Z") }),
      item("4", { publishedAt: null }),
      item("5", { status: "done", doneAt: new Date("2026-10-14T10:00:00Z"), doneBy: "blahout" }),
    ];
    const calls = [call("c1", "L-1", "blahout", "2026-10-14T08:00:00Z"), call("c9", "L-9", "blahout", "2026-10-14T12:00:00Z", { body: null })];
    const report = buildDailyCallReport({
      planned,
      doneInPeriod: planned.filter((i) => i.status === "done"),
      calls,
      matchCalls: calls,
      names: new Map([["blahout", "Jaroslav Blahout"]]),
      personUserId: null,
    });
    expect(report.totals).toEqual({
      planned: 4,
      plannedDone: 2,
      plannedPending: 1,
      plannedRemoved: 1,
      draftsNotPublished: 1,
      doneInPeriod: 2,
      doneWithoutRecordedCall: 1,
      recordedCallsInPeriod: 2,
      recordedCallsOutsideQueue: 1,
    });
    expect(report.done[0]).toMatchObject({ doneBy: "Jaroslav Blahout", recordedCall: { result: "Nedovoláno", hasNote: true }, warning: null });
    expect(report.done[1]).toMatchObject({ recordedCall: null, warning: expect.stringContaining("nebyl nalezen") });
    expect(report.recordedCallsOutsideQueue).toEqual([
      expect.objectContaining({ leadId: "L-9", author: "Jaroslav Blahout", hasNote: false }),
    ]);
  });
});

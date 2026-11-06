// GPT/MCP pilot — report denní fronty volání (get_daily_call_report): plán
// vs. skutečně zaznamenané hovory. Čistá logika bez "server-only"; dotazy
// skládá dailyCallReport.ts.
//
// Definice (vše v kalendářních dnech Europe/Prague):
//   - naplánováno  = zveřejněné položky fronty s added_for_date v období
//                    (koncepty, které pracovník neviděl, se počítají zvlášť),
//                    s jejich SOUČASNÝM stavem (hotovo / čeká / odebráno);
//   - dokončeno    = položky označené jako hotové (done_at) v období, bez
//                    ohledu na den, pro který byly naplánované;
//   - spárování    = zaznamenaný hovor (call_logged) téhož leadu od toho,
//                    kdo položku dokončil, nejvýš 10 minut od dokončení —
//                    Denní volání zapisuje hovor a dokončení v jednom
//                    příkazu, takže čas sedí; chybějící hovor = nesoulad;
//   - mimo frontu  = zaznamenané hovory v období na leadech, které v období
//                    nebyly dokončené přes frontu.
import { CALL_RESULT_LABELS } from "@/app/rizeni-firmy/obchod/dnes/dailyCallLabels";
import type { CallResult } from "./dailyCallsValidation";
import { formatPragueDateTime } from "./callActivityValidation";

export const MATCH_WINDOW_MS = 10 * 60 * 1000;

export type QueueItemRow = {
  id: string;
  leadId: string;
  leadName: string;
  addedForDate: string;
  status: string;
  source: string;
  publishedAt: Date | null;
  doneAt: Date | null;
  doneBy: string | null;
  removedAt: Date | null;
};

export type ReportCallRow = {
  id: string;
  leadId: string;
  leadName: string;
  authorUserId: string;
  createdAt: Date;
  body: string | null;
  metadata: unknown;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function callSummary(call: ReportCallRow) {
  const meta = (call.metadata ?? {}) as Record<string, unknown>;
  const result = str(meta.callResult);
  return {
    activityId: call.id,
    atPrague: formatPragueDateTime(call.createdAt),
    result: result === null ? null : (CALL_RESULT_LABELS[result as CallResult] ?? result),
    hasNote: str(call.body) !== null,
  };
}

/** Spáruje dokončenou položku se zaznamenaným hovorem (stejný lead a autor, ±10 min). */
export function matchQueueItem(item: QueueItemRow, calls: readonly ReportCallRow[]): ReportCallRow | null {
  if (item.doneAt === null || item.doneBy === null) return null;
  let best: ReportCallRow | null = null;
  let bestDiff = Infinity;
  for (const call of calls) {
    if (call.leadId !== item.leadId || call.authorUserId !== item.doneBy) continue;
    const diff = Math.abs(call.createdAt.getTime() - item.doneAt.getTime());
    if (diff <= MATCH_WINDOW_MS && diff < bestDiff) {
      best = call;
      bestDiff = diff;
    }
  }
  return best;
}

export function buildDailyCallReport(input: {
  /** položky naplánované na období (added_for_date) */
  planned: readonly QueueItemRow[];
  /** položky dokončené v období (done_at) */
  doneInPeriod: readonly QueueItemRow[];
  /** zaznamenané hovory v období (u filtru osoby jen její) */
  calls: readonly ReportCallRow[];
  /** zaznamenané hovory dohledatelné ke spárování (i mírně mimo období) */
  matchCalls: readonly ReportCallRow[];
  names: Map<string, string>;
  personUserId: string | null;
}) {
  const name = (id: string | null) => (id === null ? null : (input.names.get(id) ?? id));
  const published = input.planned.filter((i) => i.publishedAt !== null);
  const drafts = input.planned.filter((i) => i.publishedAt === null);

  const done = input.doneInPeriod.filter((i) => input.personUserId === null || i.doneBy === input.personUserId);
  const doneItems = done.map((item) => {
    const call = matchQueueItem(item, input.matchCalls);
    return {
      queueItemId: item.id,
      leadId: item.leadId,
      leadName: item.leadName,
      plannedFor: item.addedForDate,
      doneAtPrague: item.doneAt ? formatPragueDateTime(item.doneAt) : null,
      doneBy: name(item.doneBy),
      recordedCall: call ? callSummary(call) : null,
      warning: call ? null : "dokončeno ve frontě, ale odpovídající zaznamenaný hovor nebyl nalezen",
    };
  });

  const doneLeadIds = new Set(done.map((i) => i.leadId));
  const outsideQueue = input.calls
    .filter((c) => !doneLeadIds.has(c.leadId))
    .map((c) => ({ leadId: c.leadId, leadName: c.leadName, author: name(c.authorUserId), ...callSummary(c) }));

  const pending = published.filter((i) => i.status === "pending");
  const removed = published.filter((i) => i.status === "removed");
  const plannedDone = published.filter((i) => i.status === "done");

  return {
    totals: {
      planned: published.length,
      plannedDone: plannedDone.length,
      plannedPending: pending.length,
      plannedRemoved: removed.length,
      draftsNotPublished: drafts.length,
      doneInPeriod: doneItems.length,
      doneWithoutRecordedCall: doneItems.filter((d) => d.recordedCall === null).length,
      recordedCallsInPeriod: input.calls.length,
      recordedCallsOutsideQueue: outsideQueue.length,
    },
    pending: pending.map((i) => ({ queueItemId: i.id, leadId: i.leadId, leadName: i.leadName, plannedFor: i.addedForDate })),
    removed: removed.map((i) => ({
      queueItemId: i.id,
      leadId: i.leadId,
      leadName: i.leadName,
      plannedFor: i.addedForDate,
      removedAtPrague: i.removedAt ? formatPragueDateTime(i.removedAt) : null,
    })),
    done: doneItems,
    recordedCallsOutsideQueue: outsideQueue,
  };
}

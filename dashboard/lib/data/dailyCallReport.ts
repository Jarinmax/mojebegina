// GPT/MCP pilot — report denní fronty volání (pravidla v
// dailyCallReportValidation.ts). Jen čtení; brána kurátora fronty
// (requireDailyCallCuratorAccess), stejně jako kurátorský pohled v aplikaci.
import "server-only";
import { and, eq, gte, lt, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dailyCallQueue, leadActivity, leads } from "@/lib/db/schema";
import { requireDailyCallCuratorContext } from "./dailyCalls";
import { getUserProfiles } from "./userProfiles";
import { leadDisplayName } from "./leadValidation";
import type { CallActivityRange } from "./callActivityValidation";
import { MATCH_WINDOW_MS, buildDailyCallReport, type QueueItemRow } from "./dailyCallReportValidation";

const queueColumns = {
  id: dailyCallQueue.id,
  leadId: dailyCallQueue.leadId,
  addedForDate: dailyCallQueue.addedForDate,
  status: dailyCallQueue.status,
  source: dailyCallQueue.source,
  publishedAt: dailyCallQueue.publishedAt,
  doneAt: dailyCallQueue.doneAt,
  doneBy: dailyCallQueue.doneBy,
  removedAt: dailyCallQueue.removedAt,
  companyName: leads.companyName,
  contactName: leads.contactName,
  contactEmail: leads.contactEmail,
  contactPhone: leads.contactPhone,
};

type QueueRow = {
  id: string;
  leadId: string;
  addedForDate: string;
  status: string;
  source: string;
  publishedAt: Date | null;
  doneAt: Date | null;
  doneBy: string | null;
  removedAt: Date | null;
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

function toItem(r: QueueRow): QueueItemRow {
  return {
    id: r.id,
    leadId: r.leadId,
    leadName: leadDisplayName(r),
    addedForDate: r.addedForDate,
    status: r.status,
    source: r.source,
    publishedAt: r.publishedAt,
    doneAt: r.doneAt,
    doneBy: r.doneBy,
    removedAt: r.removedAt,
  };
}

export async function getDailyCallReport(range: CallActivityRange, personUserId: string | null) {
  await requireDailyCallCuratorContext();

  const [plannedRows, doneRows] = await Promise.all([
    db
      .select(queueColumns)
      .from(dailyCallQueue)
      .innerJoin(leads, eq(leads.id, dailyCallQueue.leadId))
      .where(and(gte(dailyCallQueue.addedForDate, range.dateFrom), lte(dailyCallQueue.addedForDate, range.dateTo)))
      .orderBy(dailyCallQueue.addedForDate, dailyCallQueue.position),
    db
      .select(queueColumns)
      .from(dailyCallQueue)
      .innerJoin(leads, eq(leads.id, dailyCallQueue.leadId))
      .where(and(eq(dailyCallQueue.status, "done"), gte(dailyCallQueue.doneAt, range.start), lt(dailyCallQueue.doneAt, range.end)))
      .orderBy(dailyCallQueue.doneAt),
  ]);

  const callColumns = {
    id: leadActivity.id,
    leadId: leadActivity.leadId,
    authorUserId: leadActivity.authorUserId,
    createdAt: leadActivity.createdAt,
    body: leadActivity.body,
    metadata: leadActivity.metadata,
    companyName: leads.companyName,
    contactName: leads.contactName,
    contactEmail: leads.contactEmail,
    contactPhone: leads.contactPhone,
  };
  // Párovací okno přesahuje hranice období o ±10 min (dokončení těsně před půlnocí).
  const callRows = await db
    .select(callColumns)
    .from(leadActivity)
    .innerJoin(leads, eq(leads.id, leadActivity.leadId))
    .where(
      and(
        eq(leadActivity.kind, "call_logged"),
        gte(leadActivity.createdAt, new Date(range.start.getTime() - MATCH_WINDOW_MS)),
        lt(leadActivity.createdAt, new Date(range.end.getTime() + MATCH_WINDOW_MS))
      )
    )
    .orderBy(leadActivity.createdAt);

  const allCalls = callRows.map((c) => ({
    id: c.id,
    leadId: c.leadId,
    leadName: leadDisplayName(c),
    authorUserId: c.authorUserId,
    createdAt: c.createdAt,
    body: c.body,
    metadata: c.metadata,
  }));
  const inPeriod = allCalls.filter(
    (c) =>
      c.createdAt.getTime() >= range.start.getTime() &&
      c.createdAt.getTime() < range.end.getTime() &&
      (personUserId === null || c.authorUserId === personUserId)
  );

  const userIds = [
    ...new Set([...doneRows.map((r) => r.doneBy), ...allCalls.map((c) => c.authorUserId)].filter((v): v is string => !!v)),
  ];
  const profiles = await getUserProfiles(userIds);
  const names = new Map([...profiles].map(([id, p]) => [id, p.name ?? p.email]));

  return buildDailyCallReport({
    planned: plannedRows.map(toItem),
    doneInPeriod: doneRows.map(toItem),
    calls: inPeriod,
    matchCalls: allCalls,
    names,
    personUserId,
  });
}

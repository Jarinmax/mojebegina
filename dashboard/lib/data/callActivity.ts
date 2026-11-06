// GPT/MCP pilot — aktivita obchodníka v hovorech za den/období (Europe/Prague).
// Jen čtení. Stejná brána jako zbytek CRM (requireCrmContext), stejně jako
// detail leadu, který historii hovorů všech autorů ukazuje každému
// s přístupem do CRM. Pravidla počítání a rozlišení prvního kontaktu viz
// callActivityValidation.ts.
import "server-only";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leadActivity, leads } from "@/lib/db/schema";
import { listStaffOptions, requireCrmContext } from "./leads";
import { importedLeadIds } from "./agentLeads";
import {
  CALL_ACTIVITY_TIME_ZONE,
  earliestCallByLead,
  matchSalesperson,
  summarizeCallActivity,
  validateCallActivityRange,
  type CallActivitySummary,
  type StaffCandidate,
} from "./callActivityValidation";

export type SalespersonCallActivity = CallActivitySummary & {
  salesperson: { userId: string; name: string | null; email: string };
  period: { dateFrom: string; dateTo: string; timeZone: string; startUtc: string; endUtcExclusive: string };
};

export type SalespersonCallActivityResult =
  | { ok: true; value: SalespersonCallActivity }
  | { ok: false; error: string; candidates?: StaffCandidate[] };

export async function getSalespersonCallActivity(input: {
  salesperson: string;
  dateFrom: string;
  dateTo: string | null;
}): Promise<SalespersonCallActivityResult> {
  await requireCrmContext();

  const range = validateCallActivityRange(input.dateFrom, input.dateTo);
  if (!range.ok) {
    return range;
  }
  const { start, end } = range.value;

  const staff = await listStaffOptions();
  const match = matchSalesperson(input.salesperson, staff);
  if (match.kind === "none") {
    return { ok: false, error: "Obchodník nebyl nalezen.", candidates: staff };
  }
  if (match.kind === "many") {
    return { ok: false, error: "Zadanému jménu odpovídá víc lidí — upřesněte, koho myslíte.", candidates: match.candidates };
  }
  const person = match.person;

  // Jen skutečně uložené hovory (call_logged) tohoto autora v [start, end).
  const calls = await db
    .select({
      id: leadActivity.id,
      leadId: leadActivity.leadId,
      createdAt: leadActivity.createdAt,
      body: leadActivity.body,
      metadata: leadActivity.metadata,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactEmail: leads.contactEmail,
      contactPhone: leads.contactPhone,
      stage: leads.stage,
    })
    .from(leadActivity)
    .innerJoin(leads, eq(leads.id, leadActivity.leadId))
    .where(
      and(
        eq(leadActivity.kind, "call_logged"),
        eq(leadActivity.authorUserId, person.userId),
        gte(leadActivity.createdAt, start),
        lt(leadActivity.createdAt, end)
      )
    )
    .orderBy(asc(leadActivity.createdAt), asc(leadActivity.id));

  // První kontakt se posuzuje proti CELÉ historii leadu (všichni autoři,
  // i hovory před začátkem období).
  const leadIds = [...new Set(calls.map((c) => c.leadId))];
  const earlierCalls =
    leadIds.length === 0
      ? []
      : await db
          .select({ id: leadActivity.id, leadId: leadActivity.leadId, createdAt: leadActivity.createdAt })
          .from(leadActivity)
          .where(
            and(eq(leadActivity.kind, "call_logged"), inArray(leadActivity.leadId, leadIds), lt(leadActivity.createdAt, end))
          );

  const imported = await importedLeadIds(leadIds);

  const summary = summarizeCallActivity(
    calls.map((c) => ({
      id: c.id,
      leadId: c.leadId,
      createdAt: c.createdAt,
      body: c.body,
      metadata: c.metadata,
      lead: {
        companyName: c.companyName,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        stage: c.stage,
      },
      imported: imported.has(c.leadId),
    })),
    earliestCallByLead(earlierCalls)
  );

  return {
    ok: true,
    value: {
      salesperson: { userId: person.userId, name: person.name, email: person.email },
      period: {
        dateFrom: range.value.dateFrom,
        dateTo: range.value.dateTo,
        timeZone: CALL_ACTIVITY_TIME_ZONE,
        startUtc: start.toISOString(),
        endUtcExclusive: end.toISOString(),
      },
      ...summary,
    },
  };
}

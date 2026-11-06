// GPT/MCP pilot — čtení leadů pro asistenta: filtrovaný výpis se stránkováním
// a úplná historie leadu. Jen čtení, stejná brána jako zbytek CRM
// (requireCrmContext). Samostatný soubor (ne leads.ts), aby se nepletl
// s rozpracovanými větvemi, které leads.ts mění.
import "server-only";
import { and, asc, count, desc, eq, exists, gte, inArray, isNotNull, isNull, lt, max, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leadActivity, leads } from "@/lib/db/schema";
import { requireCrmContext } from "./leads";
import { getUserProfiles } from "./userProfiles";
import { leadDisplayName } from "./leadValidation";
import { pragueDayStart, shiftDate, type CallActivityRange } from "./callActivityValidation";
import { ACTIVE_LEAD_STAGES, CLOSED_LEAD_STAGES, type LeadPreset } from "./agentLeadsValidation";

export type AgentLeadFilter = {
  /** userId obchodníka, "none" = bez obchodníka, null = kdokoli */
  owner: string | null;
  stages: string[] | null;
  preset: LeadPreset | null;
  created: CallActivityRange | null;
  lastContact: CallActivityRange | null;
  nextContact: CallActivityRange | null;
  /** jen pro preset new_assigned */
  assigned: CallActivityRange | null;
  today: string;
};

// Funkce, ne konstanta: `db` se smí sáhnout až při dotazu (testy ho podstrkují).
const callExists = () =>
  exists(
    db
      .select({ one: sql`1` })
      .from(leadActivity)
      .where(and(eq(leadActivity.leadId, leads.id), eq(leadActivity.kind, "call_logged")))
  );

function presetCondition(filter: AgentLeadFilter): SQL | undefined {
  const todayStart = pragueDayStart(filter.today);
  const tomorrowStart = pragueDayStart(shiftDate(filter.today, 1));
  const active = inArray(leads.stage, ACTIVE_LEAD_STAGES);
  switch (filter.preset) {
    case null:
      return undefined;
    case "active":
      return active;
    case "never_called":
      return sql`NOT ${callExists()}`;
    case "called":
      return callExists();
    case "overdue":
      return and(active, lt(leads.nextFollowUpAt, todayStart));
    case "due_today":
      return and(active, gte(leads.nextFollowUpAt, todayStart), lt(leads.nextFollowUpAt, tomorrowStart));
    case "missing_next_step":
      return and(active, isNull(leads.nextFollowUpAt), or(isNull(leads.nextStepNote), sql`trim(${leads.nextStepNote}) = ''`));
    case "no_follow_up_date":
      return and(active, isNull(leads.nextFollowUpAt));
    case "closed":
      return inArray(leads.stage, CLOSED_LEAD_STAGES);
    case "new_assigned": {
      const range = filter.assigned!;
      // Přidělení = záznam owner_assigned na SOUČASNÉHO obchodníka v období,
      // nebo lead v období založený rovnou s obchodníkem.
      return and(
        isNotNull(leads.ownerUserId),
        or(
          exists(
            db
              .select({ one: sql`1` })
              .from(leadActivity)
              .where(
                and(
                  eq(leadActivity.leadId, leads.id),
                  eq(leadActivity.kind, "owner_assigned"),
                  sql`${leadActivity.metadata}->>'ownerUserId' = ${leads.ownerUserId}`,
                  gte(leadActivity.createdAt, range.start),
                  lt(leadActivity.createdAt, range.end)
                )
              )
          ),
          and(gte(leads.createdAt, range.start), lt(leads.createdAt, range.end))
        )
      );
    }
  }
}

function whereFor(filter: AgentLeadFilter): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    filter.owner === "none" ? isNull(leads.ownerUserId) : filter.owner ? eq(leads.ownerUserId, filter.owner) : undefined,
    filter.stages ? inArray(leads.stage, filter.stages) : undefined,
    filter.created ? and(gte(leads.createdAt, filter.created.start), lt(leads.createdAt, filter.created.end)) : undefined,
    filter.lastContact
      ? and(gte(leads.lastContactedAt, filter.lastContact.start), lt(leads.lastContactedAt, filter.lastContact.end))
      : undefined,
    filter.nextContact
      ? and(gte(leads.nextFollowUpAt, filter.nextContact.start), lt(leads.nextFollowUpAt, filter.nextContact.end))
      : undefined,
    presetCondition(filter),
  ];
  return and(...conditions);
}

export type AgentLeadRow = {
  id: string;
  name: string;
  companyName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  city: string | null;
  venueType: string | null;
  source: string;
  stage: string;
  ownerName: string | null;
  createdAt: Date;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  nextStepNote: string | null;
  recordedCalls: number;
  lastRecordedCallAt: Date | null;
  imported: boolean;
};

/** Leady, které vznikly importem z tabulky (záznam "created" s importBatch). */
export async function importedLeadIds(leadIds: string[]): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();
  const rows = await db
    .select({ leadId: leadActivity.leadId })
    .from(leadActivity)
    .where(
      and(
        inArray(leadActivity.leadId, leadIds),
        eq(leadActivity.kind, "created"),
        sql`${leadActivity.metadata} ? 'importBatch'`
      )
    );
  return new Set(rows.map((r) => r.leadId));
}

export async function isImportedLead(leadId: string): Promise<boolean> {
  return (await importedLeadIds([leadId])).has(leadId);
}

export async function listLeadsForAgent(
  filter: AgentLeadFilter,
  page: { limit: number; offset: number }
): Promise<{ total: number; rows: AgentLeadRow[] }> {
  await requireCrmContext();
  const where = whereFor(filter);

  const [{ total }] = await db.select({ total: count() }).from(leads).where(where);

  const order =
    filter.preset === "new_assigned" || filter.created
      ? [desc(leads.createdAt), asc(leads.id)]
      : filter.preset === "closed" || filter.lastContact
        ? [sql`${leads.lastContactedAt} DESC NULLS LAST`, asc(leads.id)]
        : [sql`${leads.nextFollowUpAt} ASC NULLS LAST`, desc(leads.createdAt), asc(leads.id)];

  const rows = await db
    .select()
    .from(leads)
    .where(where)
    .orderBy(...order)
    .limit(page.limit)
    .offset(page.offset);

  const ids = rows.map((r) => r.id);
  const ownerIds = [...new Set(rows.map((r) => r.ownerUserId).filter((v): v is string => v !== null))];
  const [owners, callStats, imported] = await Promise.all([
    getUserProfiles(ownerIds),
    ids.length === 0
      ? Promise.resolve([])
      : db
          .select({ leadId: leadActivity.leadId, n: count(), last: max(leadActivity.createdAt) })
          .from(leadActivity)
          .where(and(inArray(leadActivity.leadId, ids), eq(leadActivity.kind, "call_logged")))
          .groupBy(leadActivity.leadId),
    importedLeadIds(ids),
  ]);
  const statsByLead = new Map(callStats.map((s) => [s.leadId, s]));

  return {
    total: Number(total),
    rows: rows.map((r) => {
      const owner = r.ownerUserId ? owners.get(r.ownerUserId) : null;
      const stats = statsByLead.get(r.id);
      return {
        id: r.id,
        name: leadDisplayName(r),
        companyName: r.companyName,
        contactName: r.contactName,
        contactPhone: r.contactPhone,
        contactEmail: r.contactEmail,
        city: r.city,
        venueType: r.venueType,
        source: r.source,
        stage: r.stage,
        ownerName: owner?.name ?? owner?.email ?? null,
        createdAt: r.createdAt,
        lastContactedAt: r.lastContactedAt,
        nextFollowUpAt: r.nextFollowUpAt,
        nextStepNote: r.nextStepNote,
        recordedCalls: Number(stats?.n ?? 0),
        lastRecordedCallAt: stats?.last ? new Date(stats.last as unknown as string) : null,
        imported: imported.has(r.id),
      };
    }),
  };
}

export type LeadHistoryEntry = {
  id: string;
  kind: string;
  authorName: string | null;
  body: string | null;
  metadata: unknown;
  createdAt: Date;
};

/** Historie leadu od nejnovějšího, po stránkách; null = lead neexistuje. */
export async function getLeadHistoryPage(
  leadId: string,
  page: { limit: number; offset: number }
): Promise<{ total: number; recordedCalls: number; firstRecordedCallAt: Date | null; entries: LeadHistoryEntry[] } | null> {
  await requireCrmContext();
  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return null;

  const [[{ total }], [calls], entries] = await Promise.all([
    db.select({ total: count() }).from(leadActivity).where(eq(leadActivity.leadId, leadId)),
    db
      .select({ n: count(), first: sql<string | null>`min(${leadActivity.createdAt})` })
      .from(leadActivity)
      .where(and(eq(leadActivity.leadId, leadId), eq(leadActivity.kind, "call_logged"))),
    db
      .select({
        id: leadActivity.id,
        kind: leadActivity.kind,
        authorName: leadActivity.authorName,
        body: leadActivity.body,
        metadata: leadActivity.metadata,
        createdAt: leadActivity.createdAt,
      })
      .from(leadActivity)
      .where(eq(leadActivity.leadId, leadId))
      .orderBy(desc(leadActivity.createdAt), desc(leadActivity.id))
      .limit(page.limit)
      .offset(page.offset),
  ]);

  return {
    total: Number(total),
    recordedCalls: Number(calls?.n ?? 0),
    firstRecordedCallAt: calls?.first ? new Date(calls.first) : null,
    entries,
  };
}

// Hovory a kontakty (/prace/hovory) — jen čtení. Stejná brána jako Denní
// volání (dailyCallsAuth.ts, konkrétní osoby + role):
//   • pracovník (Blahout) vidí historii SVÝCH hovorů,
//   • kurátor (Viner) vidí hovory všech, s autorem.
// Hledat a otevřít lze libovolný kontakt (lead). Detail leadu sám má bránu
// CRM (ADMIN/EXECUTIVE), kterou oba splňují. Nic se tu nezapisuje; další
// hovor se zapisuje na detailu leadu (logCallOutcome v leads.ts).
import "server-only";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leadActivity, leads } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { isDailyCallCurator, requireDailyCallWorkerAccess } from "./dailyCallsAuth";
import { leadDisplayName, type LeadStage } from "./leadValidation";
import {
  CALL_HISTORY_PAGE_SIZE,
  CONTACT_SEARCH_LIMIT,
  describeCall,
  type CallSummary,
  type ContactSearch,
} from "./callHistoryValidation";

export type CallHistoryEntry = CallSummary & {
  id: string;
  leadId: string;
  createdAt: Date;
  displayName: string;
  contactPhone: string | null;
  stage: LeadStage;
  note: string | null;
  authorName: string | null;
};

export type CallHistoryView = {
  allAuthors: boolean;
  page: number;
  hasMore: boolean;
  entries: CallHistoryEntry[];
};

export async function getCallHistory(page: number): Promise<CallHistoryView> {
  const ctx = requireDailyCallWorkerAccess(await getAuthContext());
  const allAuthors = isDailyCallCurator(ctx);

  const conditions: SQL[] = [eq(leadActivity.kind, "call_logged")];
  if (!allAuthors) conditions.push(eq(leadActivity.authorUserId, ctx.userId));

  const rows = await db
    .select({
      id: leadActivity.id,
      leadId: leadActivity.leadId,
      createdAt: leadActivity.createdAt,
      body: leadActivity.body,
      metadata: leadActivity.metadata,
      authorName: leadActivity.authorName,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactPhone: leads.contactPhone,
      contactEmail: leads.contactEmail,
      stage: leads.stage,
    })
    .from(leadActivity)
    .innerJoin(leads, eq(leads.id, leadActivity.leadId))
    .where(and(...conditions))
    .orderBy(desc(leadActivity.createdAt), desc(leadActivity.id))
    .limit(CALL_HISTORY_PAGE_SIZE + 1)
    .offset(page * CALL_HISTORY_PAGE_SIZE);

  return {
    allAuthors,
    page,
    hasMore: rows.length > CALL_HISTORY_PAGE_SIZE,
    entries: rows.slice(0, CALL_HISTORY_PAGE_SIZE).map((r) => ({
      ...describeCall(r.metadata),
      id: r.id,
      leadId: r.leadId,
      createdAt: r.createdAt,
      displayName: leadDisplayName(r),
      contactPhone: r.contactPhone,
      stage: r.stage as LeadStage,
      note: r.body,
      authorName: r.authorName,
    })),
  };
}

export type ContactSearchResult = {
  id: string;
  displayName: string;
  contactName: string | null;
  contactPhone: string | null;
  city: string | null;
  stage: LeadStage;
  lastCallAt: Date | null;
  nextFollowUpAt: Date | null;
};

export async function searchContacts(search: ContactSearch): Promise<ContactSearchResult[]> {
  requireDailyCallWorkerAccess(await getAuthContext());

  const matches: SQL[] = [
    ilike(leads.companyName, search.pattern),
    ilike(leads.contactName, search.pattern),
    ilike(leads.contactEmail, search.pattern),
    ilike(leads.contactPhone, search.pattern),
    ilike(leads.city, search.pattern),
  ];
  if (search.digits) {
    matches.push(sql`regexp_replace(coalesce(${leads.contactPhone}, ''), '\\D', '', 'g') LIKE ${`%${search.digits}%`}`);
  }

  // Tabulku píšeme výslovně: drizzle by ${leads.id} v select poli vypsal jen
  // jako "id" a to by se v poddotazu vztáhlo k lead_activity.id.
  const lastCallAt = sql<Date | null>`(
    SELECT max(la.created_at) FROM lead_activity la
     WHERE la.lead_id = "leads"."id" AND la.kind = 'call_logged'
  )`;

  const rows = await db
    .select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactPhone: leads.contactPhone,
      contactEmail: leads.contactEmail,
      city: leads.city,
      stage: leads.stage,
      nextFollowUpAt: leads.nextFollowUpAt,
      lastCallAt,
    })
    .from(leads)
    .where(or(...matches))
    .orderBy(sql`${lastCallAt} DESC NULLS LAST`, leads.companyName, leads.contactName)
    .limit(CONTACT_SEARCH_LIMIT);

  return rows.map((r) => ({
    id: r.id,
    displayName: leadDisplayName(r),
    contactName: r.companyName ? r.contactName : null,
    contactPhone: r.contactPhone,
    city: r.city,
    stage: r.stage as LeadStage,
    // neon-http vrací výsledek sql<> poddotazu jako text — sjednotit na Date
    lastCallAt: r.lastCallAt ? new Date(r.lastCallAt) : null,
    nextFollowUpAt: r.nextFollowUpAt,
  }));
}

export type TodayCall = {
  leadId: string;
  displayName: string;
  contactPhone: string | null;
  createdAt: Date;
  resultLabel: string | null;
  note: string | null;
  authorName: string | null;
};

/**
 * Dnes zavoláno — kontakty s uloženým hovorem DNES (Europe/Prague), každý
 * jednou (poslední hovor), nejnovější nahoře. Aby se Jarda mohl za chvíli
 * vrátit ke kontaktu, který mu po zapsání výsledku zmizel z fronty.
 * Pracovník vidí své hovory, kurátor hovory všech (stejně jako historie).
 */
export async function getTodayCalls(): Promise<{ allAuthors: boolean; calls: TodayCall[] }> {
  const ctx = requireDailyCallWorkerAccess(await getAuthContext());
  const allAuthors = isDailyCallCurator(ctx);
  const author = allAuthors ? sql`TRUE` : sql`la.author_user_id = ${ctx.userId}`;

  const result = await db.execute<{
    lead_id: string;
    created_at: string | Date;
    body: string | null;
    metadata: unknown;
    author_name: string | null;
    company_name: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  }>(sql`
    SELECT DISTINCT ON (la.lead_id)
           la.lead_id, la.created_at, la.body, la.metadata, la.author_name,
           l.company_name, l.contact_name, l.contact_phone, l.contact_email
      FROM lead_activity la
      JOIN leads l ON l.id = la.lead_id
     WHERE la.kind = 'call_logged'
       AND ${author}
       AND (la.created_at AT TIME ZONE 'Europe/Prague')::date = (now() AT TIME ZONE 'Europe/Prague')::date
     ORDER BY la.lead_id, la.created_at DESC, la.id DESC
  `);

  const calls = result.rows
    .map((r) => ({
      leadId: r.lead_id,
      displayName: leadDisplayName({
        companyName: r.company_name,
        contactName: r.contact_name,
        contactPhone: r.contact_phone,
        contactEmail: r.contact_email,
      }),
      contactPhone: r.contact_phone,
      createdAt: new Date(r.created_at),
      resultLabel: describeCall(r.metadata).resultLabel,
      note: r.body,
      authorName: r.author_name,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { allAuthors, calls };
}

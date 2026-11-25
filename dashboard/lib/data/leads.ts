// Security Phase 16 (Obchod/CRM 1.0) — datová vrstva CRM. Stejný princip
// jako orders.ts/companyNodes.ts: kontrola a dotaz jsou neoddělitelné,
// každá exportovaná funkce si sama volá requireCrmContext(). Gate je
// z crmAuth.ts, ne z orderAuth.ts/adminAuth.ts — každá doména má vlastní
// izolovanou bránu (viz crmAuth.ts komentář).
//
// Lead je záměrně samostatná entita, ne organizations řádek (organizations
// vyžaduje NOT NULL ico/registeredAddress, které lead před konverzí nemá —
// viz schema.ts komentář u `leads`). Propojení vzniká výhradně přes
// leads.convertedOrganizationId, nastavené atomicky při konverzi
// (linkLeadToExistingOrganization / convertLeadToNewOrganization).
import "server-only";
import { planCustomerCardChange } from "./customerCard";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, leadActivity, leadCalendarSync, organizations, organizationActivity, orders, userRoles } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireCrmAccess } from "./crmAuth";
import { claimUnownedLeadOnReach } from "./leadClaim";
import { validateHeardFromInput } from "./heardFrom";
import { countConsecutiveNoAnswers, planNextAttempt, MAX_CALL_ATTEMPTS, type AttemptPlan } from "./callAttempts";
import { createCustomerOrganization, type CreateCustomerResult } from "./admin";
import type { CreateCustomerInput } from "./createCustomerValidation";
import { getUserProfile, getUserProfiles } from "./userProfiles";
import { notifyLeadOwner } from "./leadAssignmentNotify";
import { distinctOrganizationIds } from "./orderBuyer";
import {
  validateCreateLeadInput,
  validateStageInput,
  validateCallLogInput,
  validateCompanyNameInput,
  validateLeadCompanyDetailsInput,
  validateNoteInput,
  validateNextStepInput,
  likePattern,
  isFollowUpOverdue,
  isNewUnassignedLead,
  isTodayInPrague,
  leadDisplayName,
  compareLeadsForList,
  ACTIVE_LEAD_STAGES,
  type CreateLeadInput,
  type CallLogInput,
  type NextStepInput,
  type LeadStage,
  type LeadCompanyDetailsInput,
} from "./leadValidation";
import { reconcileLeadCalendarEvent, upsertPendingLeadCalendarSync } from "./googleCalendar";
import type { AuthContext } from "./types";

// Security Phase 20 (Google Kalendář 1.0) — AŽ PO úspěšném commitu CRM
// zápisu výše (ten už je nevratný). Selhání tady nesmí vrátit zpět
// správně uložený zápis — stejný princip jako dailyCalls.ts:
// logDailyCallOutcome (try/catch obalující jen best-effort vedlejší
// účinek, ne hlavní zápis).
async function reconcileCalendarAfterCommit(leadId: string): Promise<void> {
  try {
    await reconcileLeadCalendarEvent(leadId);
  } catch {
    // Stav zůstává v lead_calendar_sync (pending/failed) — uživatel uvidí
    // "synchronizace kalendáře selhala" a může zopakovat.
  }
}

// Security Phase 20 (Google Kalendář 1.0) — idempotentní "Zkusit znovu"
// pro lead_calendar_sync ve stavu "failed". reconcileLeadCalendarEvent
// je bezpečné zavolat opakovaně (deterministické event id, 409 → patch),
// takže sem žádná speciální logika navíc nejde — jen ověření přístupu,
// zavolání a přečtení výsledného stavu pro srozumitelnou chybu uživateli.
export async function retryLeadCalendarSync(leadId: string): Promise<LeadResult> {
  await requireCrmContext();
  await reconcileLeadCalendarEvent(leadId);

  const [row] = await db
    .select({ syncStatus: leadCalendarSync.syncStatus, lastError: leadCalendarSync.lastError })
    .from(leadCalendarSync)
    .where(eq(leadCalendarSync.leadId, leadId))
    .limit(1);

  if (row?.syncStatus === "failed") {
    return { ok: false, error: row.lastError ?? "Synchronizace s Google kalendářem se nezdařila." };
  }
  return { ok: true };
}

export async function requireCrmContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireCrmAccess(ctx);
}

// --- Pickery -------------------------------------------------------------

export type StaffOption = { userId: string; name: string | null; email: string };

// MVP: ADMIN/EXECUTIVE/EMPLOYEE jsou kandidáti na "obchodníka" — stejná
// šířka jako orders.ts:listInternalStaff, ale samostatná kopie (vlastní
// CRM brána, ne cross-import z domény Objednávek — viz crmAuth.ts).
export async function listStaffOptions(): Promise<StaffOption[]> {
  await requireCrmContext();

  const roleRows = await db
    .selectDistinct({ userId: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.systemRole, ["ADMIN", "EXECUTIVE", "EMPLOYEE"]));

  const userIds = roleRows.map((r) => r.userId);
  const profiles = await getUserProfiles(userIds);

  return userIds
    .map((userId) => {
      const profile = profiles.get(userId);
      return profile ? { userId, name: profile.name, email: profile.email } : null;
    })
    .filter((v): v is StaffOption => v !== null)
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

// --- Leady: seznam / kokpit ----------------------------------------------

export type LeadCardData = {
  id: string;
  companyName: string | null;
  displayName: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  city: string | null;
  venueType: string | null;
  source: string;
  stage: LeadStage;
  ownerUserId: string | null;
  ownerName: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  nextStepNote: string | null;
  followUpOverdue: boolean;
  createdAt: Date;
  /** Bez obchodníka a ve fázi „nový“ — viz isNewUnassignedLead. */
  isNew: boolean;
  /** „Odkud nás zná“ (heardFrom.ts); null = zatím nezjištěno. */
  heardFrom: string | null;
  heardFromDetail: string | null;
};

async function buildLeadCards(rows: (typeof leads.$inferSelect)[]): Promise<LeadCardData[]> {
  if (rows.length === 0) {
    return [];
  }
  const ownerIds = [...new Set(rows.map((r) => r.ownerUserId).filter((v): v is string => v !== null))];
  const owners = await getUserProfiles(ownerIds);

  return rows.map((r) => {
    const owner = r.ownerUserId ? owners.get(r.ownerUserId) : null;
    const stage = r.stage as LeadStage;
    return {
      id: r.id,
      companyName: r.companyName,
      displayName: leadDisplayName(r),
      contactName: r.contactName,
      contactPhone: r.contactPhone,
      contactEmail: r.contactEmail,
      city: r.city,
      venueType: r.venueType,
      source: r.source,
      stage,
      ownerUserId: r.ownerUserId,
      ownerName: owner?.name ?? owner?.email ?? null,
      lastContactedAt: r.lastContactedAt,
      nextFollowUpAt: r.nextFollowUpAt,
      nextStepNote: r.nextStepNote,
      followUpOverdue: isFollowUpOverdue(stage, r.nextFollowUpAt),
      createdAt: r.createdAt,
      isNew: isNewUnassignedLead({ ownerUserId: r.ownerUserId, stage }),
      heardFrom: r.heardFrom,
      heardFromDetail: r.heardFromDetail,
    };
  });
}

export type LeadListFilter = "mine" | "all";

// Konvertované leady (stage=converted) se v seznamu NEZOBRAZUJÍ — od
// konverze dál žije zákazník přes organizations/orders (viz
// listMyCustomers/listAllCustomers), lead zůstává jen jako historická
// stopa dohledatelná z detailu organizace v budoucnu.
export async function listLeads(filter: LeadListFilter): Promise<LeadCardData[]> {
  const ctx = await requireCrmContext();

  const rows = await db
    .select()
    .from(leads)
    .where(
      filter === "mine"
        ? and(eq(leads.ownerUserId, ctx.userId), inArray(leads.stage, ACTIVE_LEAD_STAGES))
        : inArray(leads.stage, ACTIVE_LEAD_STAGES)
    );

  // Naléhavost napřed: po termínu → nejbližší follow-up → bez follow-upu,
  // se stabilním tiebreakem (createdAt, pak id) — viz compareLeadsForList
  // v leadValidation.ts. Řadí se ještě SQL řádky, ne až karty, aby pořadí
  // bylo shodné pro "Moje leady" i "Všechny leady".
  const sortedRows = [...rows].sort((a, b) =>
    compareLeadsForList(
      { id: a.id, stage: a.stage as LeadStage, nextFollowUpAt: a.nextFollowUpAt, createdAt: a.createdAt, ownerUserId: a.ownerUserId },
      { id: b.id, stage: b.stage as LeadStage, nextFollowUpAt: b.nextFollowUpAt, createdAt: b.createdAt, ownerUserId: b.ownerUserId }
    )
  );

  return buildLeadCards(sortedRows);
}

// Souhrn pro marketing (20. 11. 2026): odkud nás zákazníci znají.
export type HeardFromSummary = { counts: { key: string; count: number }[]; missing: number };

export async function getHeardFromSummary(): Promise<HeardFromSummary> {
  await requireCrmContext();
  const rows = await db
    .select({ heardFrom: leads.heardFrom, lastContactedAt: leads.lastContactedAt })
    .from(leads);
  const map = new Map<string, number>();
  let missing = 0;
  for (const r of rows) {
    if (r.heardFrom) map.set(r.heardFrom, (map.get(r.heardFrom) ?? 0) + 1);
    else if (r.lastContactedAt) missing += 1;
  }
  const counts = [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  return { counts, missing };
}

// Nové leady bez obchodníka (např. z formuláře Meta) — samostatný blok nahoře
// na stránce Obchod, ať je vidí každý bez ohledu na vybranou záložku.
/**
 * 20. 11. 2026 (Lucie): „Nové leady“ = ve fázi nový a ještě bez zaznamenaného
 * kontaktu — i když už mají obchodníka (přiřazený lead tam zůstane, dokud
 * mu někdo nezavolá, a je u něj vidět komu patří).
 */
export async function listFreshLeads(): Promise<LeadCardData[]> {
  await requireCrmContext();
  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.stage, "new"),
        isNull(leads.lastContactedAt),
        // Jen opravdu nové poptávky: ne 85 kontaktů ze staré databáze
        // (import 26. 9. 2026, už mají obchodníka) a nic staršího než 30 dní.
        ne(leads.source, "existing_database"),
        gte(leads.createdAt, new Date(Date.now() - FRESH_LEAD_DAYS * 24 * 60 * 60 * 1000)),
        // 22. 11. 2026 (Lucie, LumoKids): s leadem už někdo pracuje — má
        // naplánovaný další kontakt nebo poznámku/zápis hovoru → není „nový“.
        isNull(leads.nextFollowUpAt),
        sql`not exists (select 1 from ${leadActivity} a where a.lead_id = ${leads.id} and a.kind in ('note_added', 'call_logged'))`
      )
    )
    .orderBy(desc(leads.createdAt), asc(leads.id));
  return buildLeadCards(rows);
}

const FRESH_LEAD_DAYS = 30;

export async function listNewUnassignedLeads(): Promise<LeadCardData[]> {
  await requireCrmContext();
  const rows = await db
    .select()
    .from(leads)
    .where(and(isNull(leads.ownerUserId), eq(leads.stage, "new")))
    .orderBy(desc(leads.createdAt), asc(leads.id));
  return buildLeadCards(rows);
}

export type CockpitCounts = {
  toCallToday: number;
  followUp7d: number;
  negotiating: number;
  newCustomers30d: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Vždy počítáno pro AKTUÁLNĚ přihlášeného uživatele (ne pro aktuálně
// vybraný filtr seznamu níže) — kokpit má Jardovi hned po otevření ukázat
// JEHO dnešní práci, bez ohledu na to, jestli si zrovna prohlíží "Všechny
// leady" nebo "Moje leady".
export async function getCockpitCounts(): Promise<CockpitCounts> {
  const ctx = await requireCrmContext();

  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);
  const in7Days = new Date(Date.now() + 7 * DAY_MS);

  const myActiveLeads = await db
    .select({
      stage: leads.stage,
      nextFollowUpAt: leads.nextFollowUpAt,
    })
    .from(leads)
    .where(and(eq(leads.ownerUserId, ctx.userId), inArray(leads.stage, ACTIVE_LEAD_STAGES)));

  let toCallToday = 0;
  let followUp7d = 0;
  let negotiating = 0;
  for (const lead of myActiveLeads) {
    if (lead.nextFollowUpAt && lead.nextFollowUpAt.getTime() <= endOfToday.getTime()) {
      toCallToday += 1;
    } else if (lead.nextFollowUpAt && lead.nextFollowUpAt.getTime() <= in7Days.getTime()) {
      followUp7d += 1;
    }
    if (lead.stage === "sample_offer" || lead.stage === "negotiating") {
      negotiating += 1;
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);
  const myOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.ownerUserId, ctx.userId));
  const myOrgIds = myOrgs.map((o) => o.id);

  let newCustomers30d = 0;
  if (myOrgIds.length > 0) {
    const orderRows = await db
      .select({ buyerOrganizationId: orders.buyerOrganizationId, orderedAt: orders.orderedAt })
      .from(orders)
      .where(inArray(orders.buyerOrganizationId, myOrgIds));

    const firstOrderByOrg = new Map<string, Date>();
    for (const row of orderRows) {
      if (!row.buyerOrganizationId) continue; // soukromý zákazník (SQL ho sem nepustí, jen pro typy)
      const current = firstOrderByOrg.get(row.buyerOrganizationId);
      if (!current || row.orderedAt.getTime() < current.getTime()) {
        firstOrderByOrg.set(row.buyerOrganizationId, row.orderedAt);
      }
    }
    for (const firstOrderAt of firstOrderByOrg.values()) {
      if (firstOrderAt.getTime() >= thirtyDaysAgo.getTime()) {
        newCustomers30d += 1;
      }
    }
  }

  return { toCallToday, followUp7d, negotiating, newCustomers30d };
}

export type ScheduledCallItem = {
  leadId: string;
  displayName: string;
  contactPhone: string | null;
  callAt: Date;
};

// Moje dnešní naplánované hovory — termín „Další kontakt“ (next_follow_up_at,
// datum i hodina) připadá na dnešek v Europe/Prague. Sjednoceno 13. 11. 2026:
// jedno pole s časem pro frontu, kalendář i tuhle sekci (dřív samostatné
// scheduled_call_at, které se už nepoužívá).
export async function getScheduledCallsToday(): Promise<ScheduledCallItem[]> {
  const ctx = await requireCrmContext();

  const rows = await db
    .select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactEmail: leads.contactEmail,
      contactPhone: leads.contactPhone,
      nextFollowUpAt: leads.nextFollowUpAt,
    })
    .from(leads)
    .where(and(eq(leads.ownerUserId, ctx.userId), inArray(leads.stage, ACTIVE_LEAD_STAGES), isNotNull(leads.nextFollowUpAt)));

  return rows
    .filter((r): r is typeof r & { nextFollowUpAt: Date } => r.nextFollowUpAt !== null && isTodayInPrague(r.nextFollowUpAt))
    .map((r) => ({
      leadId: r.id,
      displayName: leadDisplayName(r),
      contactPhone: r.contactPhone,
      callAt: r.nextFollowUpAt,
    }))
    .sort((a, b) => a.callAt.getTime() - b.callAt.getTime());
}

// --- Lead detail -----------------------------------------------------------

export type LeadActivityEntry = {
  id: string;
  kind: string;
  authorUserId: string;
  authorName: string | null;
  body: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type LeadCalendarSyncStatus = { status: "pending" | "synced" | "failed"; lastError: string | null };

export type LeadDetail = {
  lead: LeadCardData & {
    address: string | null;
    ico: string | null;
    acquiredByUserId: string | null;
    acquiredByName: string | null;
    convertedOrganizationId: string | null;
    calendarSync: LeadCalendarSyncStatus | null;
  };
  activity: LeadActivityEntry[];
};

export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  await requireCrmContext();

  const [row] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!row) {
    return null;
  }

  const [card] = await buildLeadCards([row]);
  const acquiredBy = row.acquiredByUserId ? await getUserProfile(row.acquiredByUserId) : null;

  const [syncRow] = await db
    .select({ syncStatus: leadCalendarSync.syncStatus, lastError: leadCalendarSync.lastError })
    .from(leadCalendarSync)
    .where(eq(leadCalendarSync.leadId, leadId))
    .limit(1);

  const activityRows = await db.select().from(leadActivity).where(eq(leadActivity.leadId, leadId));
  activityRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    lead: {
      ...card,
      address: row.address,
      ico: row.ico,
      acquiredByUserId: row.acquiredByUserId,
      acquiredByName: acquiredBy?.name ?? acquiredBy?.email ?? null,
      convertedOrganizationId: row.convertedOrganizationId,
      calendarSync: syncRow ? { status: syncRow.syncStatus as "pending" | "synced" | "failed", lastError: syncRow.lastError } : null,
    },
    activity: activityRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      authorUserId: r.authorUserId,
      authorName: r.authorName,
      body: r.body,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
  };
}

// --- Zápisy: založení, rychlý zápis hovoru, přiřazení ----------------------

export type LeadResult = { ok: true } | { ok: false; error: string };
export type CreateLeadResult = { ok: true; id: string } | { ok: false; error: string };

export async function createLead(rawInput: CreateLeadInput): Promise<CreateLeadResult> {
  const ctx = await requireCrmContext();

  const validated = validateCreateLeadInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const value = validated.value;

  const id = randomUUID();
  await db.batch([
    db.insert(leads).values({
      id,
      companyName: value.companyName,
      contactName: value.contactName,
      contactPhone: value.contactPhone,
      contactEmail: value.contactEmail,
      city: value.city,
      address: value.address,
      venueType: value.venueType,
      ico: value.ico,
      source: value.source,
      stage: "new",
      ownerUserId: ctx.userId,
    }),
    db.insert(leadActivity).values({
      leadId: id,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "created",
    }),
  ]);

  return { ok: true, id };
}

// Kombinovaná akce "rychlý zápis po hovoru" — jeden formulář, jeden submit:
// poznámka + volitelný posun fáze + volitelný další follow-up, vše
// atomicky v jednom db.batch (stejný vzor jako updateFulfillmentStatus
// v orders.ts).
// „Nezvedá“ jedním klepnutím (22. 11. 2026): zapíše marný pokus a podle
// řady pokusů (callAttempts.ts) nastaví další termín — nebo po 4. pokusu
// přestane a nastaví jednu připomínku za měsíc.
export type NoAnswerResult = { ok: true; plan: AttemptPlan } | { ok: false; error: string };

export async function logNoAnswer(leadId: string): Promise<NoAnswerResult> {
  const ctx = await requireCrmContext();
  const [lead] = await db
    .select({ stage: leads.stage, createdAt: leads.createdAt })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) return { ok: false, error: "Lead nebyl nalezen." };

  const history = await db
    .select({ kind: leadActivity.kind, metadata: leadActivity.metadata })
    .from(leadActivity)
    .where(and(eq(leadActivity.leadId, leadId), eq(leadActivity.kind, "call_logged")))
    .orderBy(desc(leadActivity.createdAt))
    .limit(10);
  const failedAttempt = countConsecutiveNoAnswers(history as { kind: string; metadata: Record<string, unknown> | null }[]) + 1;
  const plan = planNextAttempt({ failedAttempt, leadCreatedAt: lead.createdAt });

  const updates: Partial<typeof leads.$inferInsert> = {
    lastContactedAt: new Date(),
    updatedAt: new Date(),
    nextFollowUpAt: plan.nextAt ?? plan.remindAt,
    nextStepNote: plan.stop
      ? `Nedovolali jsme se (${failedAttempt} pokusy) — jednou zkusit znovu`
      : `Zavolat znovu (pokus ${failedAttempt + 1}/${MAX_CALL_ATTEMPTS})${plan.suggestEmail ? " + poslat krátký e-mail" : ""}`,
  };
  if (plan.stop && lead.stage !== "callback_later") updates.stage = "callback_later";

  await db.batch([
    db.update(leads).set(updates).where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "call_logged",
      body: plan.label,
      metadata: {
        callResult: "no_answer",
        attempt: failedAttempt,
        nextFollowUpAt: updates.nextFollowUpAt,
        stageChangedTo: updates.stage ?? null,
        from: lead.stage,
      },
    }),
    upsertPendingLeadCalendarSync(leadId),
  ]);
  await reconcileCalendarAfterCommit(leadId);
  return { ok: true, plan };
}

export async function logCallOutcome(leadId: string, rawInput: CallLogInput): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const validated = validateCallLogInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const value = validated.value;

  const [current] = await db
    .select({ stage: leads.stage, heardFrom: leads.heardFrom })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  // „Odkud nás zná“ — po dovolání povinné, dokud lead nemá uloženo (20. 11. 2026).
  const heard = validateHeardFromInput(
    { heardFrom: rawInput.heardFrom ?? "", heardFromDetail: rawInput.heardFromDetail ?? "" },
    { reached: rawInput.reached === true, alreadyKnown: current.heardFrom !== null }
  );
  if (!heard.ok) {
    return { ok: false, error: heard.error };
  }

  const updates: Partial<typeof leads.$inferInsert> = {
    lastContactedAt: new Date(),
    updatedAt: new Date(),
  };
  if (heard.value) {
    updates.heardFrom = heard.value.heardFrom;
    updates.heardFromDetail = heard.value.heardFromDetail;
  }
  if (value.nextStage) {
    updates.stage = value.nextStage;
  }
  if (value.nextFollowUpAt !== null) {
    updates.nextFollowUpAt = value.nextFollowUpAt;
  }
  if (value.nextStepNote !== null) {
    updates.nextStepNote = value.nextStepNote;
  }

  // Security Phase 20 (Google Kalendář 1.0) — upsert na 'pending' V TÉŽE
  // atomické operaci jako zápis výše (tenhle zápis může změnit
  // nextFollowUpAt i stage, oboje ovlivňuje efektivní kalendářovou
  // událost) — skutečné volání Googlu proběhne až po commitu, viz níže.
  await db.batch([
    db.update(leads).set(updates).where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "call_logged",
      body: value.note,
      metadata: {
        stageChangedTo: value.nextStage,
        nextFollowUpAt: value.nextFollowUpAt,
        from: current.stage,
        ...(heard.value ? { heardFrom: heard.value.heardFrom, heardFromDetail: heard.value.heardFromDetail } : {}),
      },
    }),
    upsertPendingLeadCalendarSync(leadId),
  ]);

  await reconcileCalendarAfterCommit(leadId);

  // Kontakt bez vlastníka → přiřadit tomu, kdo se dovolal (16. 11. 2026).
  // Až PO uloženém zápisu hovoru; selhání ho nesmí vrátit.
  if (rawInput.reached) {
    try {
      const claimed = await claimUnownedLeadOnReach(leadId, { userId: ctx.userId, name: ctx.name }, "lead_detail");
      // Teď už má vlastníka → termín do jeho kalendáře.
      if (claimed) await reconcileCalendarAfterCommit(leadId);
    } catch (error) {
      console.error("claimUnownedLeadOnReach (lead detail)", error);
    }
  }

  return { ok: true };
}

// Security Phase 20 (Google Kalendář 1.0) — explicitní smazání
// naplánovaného kontaktu. Oddělené od logCallOutcome výše, protože tam je
// next_follow_up_at nezávisle VOLITELNÉ pole (prázdné = "neřešeno", ne
// "smazat") — bez vlastní akce by nešlo rozlišit, že uživatel termín
// doopravdy chce odstranit, ne jen že ho v tomhle zápisu nevyplnil.
export async function removeLeadFollowUp(leadId: string): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const [current] = await db
    .select({ nextFollowUpAt: leads.nextFollowUpAt })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  await db.batch([
    db.update(leads).set({ nextFollowUpAt: null, updatedAt: new Date() }).where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "follow_up_removed",
      metadata: { from: current.nextFollowUpAt },
    }),
    upsertPendingLeadCalendarSync(leadId),
  ]);

  await reconcileCalendarAfterCommit(leadId);

  return { ok: true };
}

// GPT/MCP pilot — samostatná poznámka k leadu (kind "note_added", už
// dřív uvedený v schema.ts u lead_activity). Nemění fázi ani
// lastContactedAt — poznámka není hovor (na to je logCallOutcome).
export async function addLeadNote(leadId: string, rawBody: string): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const validated = validateNoteInput(rawBody);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  await db.insert(leadActivity).values({
    leadId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "note_added",
    body: validated.value,
  });

  return { ok: true };
}

// GPT/MCP pilot — "úkol" u leadu: další krok a/nebo datum dalšího kontaktu.
// Stejná pole jako v rychlém zápisu hovoru, ale bez lastContactedAt (nastavit
// si připomínku není kontakt se zákazníkem). Prázdné pole se nemění.
export async function setLeadNextStep(leadId: string, rawInput: NextStepInput): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const validated = validateNextStepInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const value = validated.value;

  const [current] = await db
    .select({ nextStepNote: leads.nextStepNote, nextFollowUpAt: leads.nextFollowUpAt })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  const updates: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
  if (value.nextStepNote !== null) {
    updates.nextStepNote = value.nextStepNote;
  }
  if (value.nextFollowUpAt !== null) {
    updates.nextFollowUpAt = value.nextFollowUpAt;
  }
  // Etapa 0, rozhodnutí 6 — smazání termínu jen výslovně (MCP clear_follow_up).
  if (value.clearFollowUp) {
    updates.nextFollowUpAt = null;
  }

  // Etapa 0 — termín z MCP se musí propsat i do Google Kalendáře stejně jako
  // z formulářů (upsert 'pending' ve stejném batchi, volání Googlu až po
  // commitu, best-effort).
  await db.batch([
    db.update(leads).set(updates).where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "next_step_set",
      body: value.nextStepNote,
      metadata: {
        nextFollowUpAt: value.nextFollowUpAt,
        followUpCleared: value.clearFollowUp,
        from: { nextStepNote: current.nextStepNote, nextFollowUpAt: current.nextFollowUpAt },
      },
    }),
    upsertPendingLeadCalendarSync(leadId),
  ]);

  await reconcileCalendarAfterCommit(leadId);

  return { ok: true };
}

// Security Phase 16.1 — doplnění názvu firmy/provozovny po hovoru (viz
// schema.ts komentář u `leads`). Vlastní akce mimo logCallOutcome, protože
// se může hodit i kdykoliv jindy, ne jen bezprostředně po telefonátu.
export async function updateLeadCompanyName(leadId: string, rawCompanyName: string): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const validated = validateCompanyNameInput(rawCompanyName);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [current] = await db
    .select({ companyName: leads.companyName })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  await db.batch([
    db
      .update(leads)
      .set({ companyName: validated.value, updatedAt: new Date() })
      .where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "company_name_set",
      metadata: { from: current.companyName, to: validated.value },
    }),
  ]);

  return { ok: true };
}

// Jarin 22. 11. 2026: obchodník (i bez práva zakládat organizace) doplní
// u leadu firmu — název, IČO, sídlo, předvyplněné z ARES. Převod na zákazníka
// (ADMIN) je pak jen potvrzení. Organizaci to nezakládá.
export async function updateLeadCompanyDetails(
  leadId: string,
  rawInput: LeadCompanyDetailsInput
): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const validated = validateLeadCompanyDetailsInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [current] = await db
    .select({ companyName: leads.companyName, ico: leads.ico, address: leads.address })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  const next = validated.value;
  if (current.companyName === next.companyName && current.ico === next.ico && current.address === next.address) {
    return { ok: true };
  }

  await db.batch([
    db
      .update(leads)
      .set({ companyName: next.companyName, ico: next.ico, address: next.address, updatedAt: new Date() })
      .where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "company_details_set",
      metadata: { from: current, to: next },
    }),
  ]);

  return { ok: true };
}

export async function updateLeadStage(leadId: string, rawStage: string): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const validated = validateStageInput(rawStage);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [current] = await db.select({ stage: leads.stage }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!current) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  await db.batch([
    db
      .update(leads)
      .set({ stage: validated.value, updatedAt: new Date() })
      .where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "stage_changed",
      metadata: { from: current.stage, to: validated.value },
    }),
    // Security Phase 20 — změna fáze může leada poslat mimo
    // ACTIVE_LEAD_STAGES (nebo zpátky do ní) → mění efektivní cílový
    // termín (effectiveNextFollowUpAt), i když next_follow_up_at samotné
    // zůstalo stejné. Upsert + reconcile se proto spouští i tady.
    upsertPendingLeadCalendarSync(leadId),
  ]);

  await reconcileCalendarAfterCommit(leadId);

  return { ok: true };
}

export async function assignLeadOwner(leadId: string, ownerUserId: string): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const owner = await getUserProfile(ownerUserId);
  if (!owner) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  const [lead] = await db.select({ id: leads.id, ownerUserId: leads.ownerUserId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  const assignedAt = new Date();
  await db.batch([
    db.update(leads).set({ ownerUserId, updatedAt: assignedAt }).where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "owner_assigned",
      metadata: { ownerUserId, ownerName: owner.name ?? owner.email },
    }),
  ]);

  // 20. 11. 2026 (Lucie): přiřazený obchodník dostane e-mail, komu volat
  // (ne když si lead přiřadí sám sobě nebo se obchodník nemění).
  if (lead.ownerUserId !== ownerUserId && ownerUserId !== ctx.userId) {
    await notifyLeadOwner(leadId, ownerUserId, ctx.name ?? "Kolega", assignedAt);
  }

  // Termín dalšího kontaktu se přestěhuje do kalendáře nového obchodníka.
  if (lead.ownerUserId !== ownerUserId) {
    await reconcileCalendarAfterCommit(leadId);
  }

  return { ok: true };
}

// Akvizice se nastavuje jednou a jen tehdy, kdy je prokazatelná — proto
// samostatná akce, ne součást assignLeadOwner. UI ji nabízí jen dokud pole
// je prázdné (viz lead detail), ale zápis to nevynucuje natvrdo (ADMIN
// může opravit omyl).
export async function setLeadAcquiredBy(leadId: string, acquiredByUserId: string): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const acquirer = await getUserProfile(acquiredByUserId);
  if (!acquirer) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  await db.batch([
    db
      .update(leads)
      .set({ acquiredByUserId, updatedAt: new Date() })
      .where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "acquired_by_set",
      metadata: { acquiredByUserId, acquiredByName: acquirer.name ?? acquirer.email },
    }),
  ]);

  return { ok: true };
}

// --- Detekce duplicit + konverze -------------------------------------------

export type OrganizationMatch = { id: string; name: string; ico: string };

export type DuplicateCandidates = {
  // Shoda IČO — velmi silný signál (leads.ico vs organizations.ico).
  icoMatches: OrganizationMatch[];
  // Shoda telefonu/e-mailu proti historii orders.contactPhone/contactEmail
  // — další možný signál, ne jistota (kontakt se mohl u zákazníka změnit).
  contactMatches: OrganizationMatch[];
  // Podobnost názvu — jen kandidát k LIDSKÉ kontrole, nikdy k automatickému
  // spojení (schváleno explicitně).
  nameMatches: OrganizationMatch[];
};

// Nikdy nic neslučuje sama — jen navrhuje kandidáty, finální propojení
// vždy potvrzuje člověk přes linkLeadToExistingOrganization.
export async function findDuplicateOrganizations(leadId: string): Promise<DuplicateCandidates> {
  await requireCrmContext();

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) {
    return { icoMatches: [], contactMatches: [], nameMatches: [] };
  }

  const selectCols = { id: organizations.id, name: organizations.name, ico: organizations.ico };

  const icoMatches =
    lead.ico && lead.ico.length > 0
      ? await db.select(selectCols).from(organizations).where(eq(organizations.ico, lead.ico))
      : [];

  let contactMatches: OrganizationMatch[] = [];
  if (lead.contactPhone || lead.contactEmail) {
    const conditions = [];
    if (lead.contactPhone) conditions.push(eq(orders.contactPhone, lead.contactPhone));
    if (lead.contactEmail) conditions.push(eq(orders.contactEmail, lead.contactEmail));
    const matchingOrders = await db
      .select({ buyerOrganizationId: orders.buyerOrganizationId })
      .from(orders)
      .where(or(...conditions));
    // Objednávky soukromých zákazníků (bez organizace) na organizaci neukazují.
    const orgIds = distinctOrganizationIds(matchingOrders);
    if (orgIds.length > 0) {
      contactMatches = await db.select(selectCols).from(organizations).where(inArray(organizations.id, orgIds));
    }
  }

  const nameMatches =
    lead.companyName && lead.companyName.trim().length >= 3
      ? await db
          .select(selectCols)
          .from(organizations)
          .where(ilike(organizations.name, `%${lead.companyName.trim()}%`))
      : [];

  const excludeIds = new Set(icoMatches.map((o) => o.id));
  return {
    icoMatches,
    contactMatches: contactMatches.filter((o) => !excludeIds.has(o.id)),
    nameMatches: nameMatches.filter(
      (o) => !excludeIds.has(o.id) && !contactMatches.some((c) => c.id === o.id)
    ),
  };
}

// Varianta A konverze — propojení s JIŽ EXISTUJÍCÍ organizací (zvolenou
// člověkem, nikdy automaticky). owner/acquiredBy se na cílové organizaci
// doplní JEN tam, kde jsou dnes NULL — nikdy nepřepíšou existující hodnotu,
// aby napojení duplicitního leadu nemohlo "ukrást" už zavedené vlastnictví.
export async function linkLeadToExistingOrganization(
  leadId: string,
  organizationId: string
): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }
  const [org] = await db
    .select({ id: organizations.id, ownerUserId: organizations.ownerUserId, acquiredByUserId: organizations.acquiredByUserId })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) {
    return { ok: false, error: "Organizace nebyla nalezena." };
  }

  const orgUpdates: Partial<typeof organizations.$inferInsert> = {};
  if (!org.ownerUserId && lead.ownerUserId) {
    orgUpdates.ownerUserId = lead.ownerUserId;
  }
  if (!org.acquiredByUserId && lead.acquiredByUserId) {
    orgUpdates.acquiredByUserId = lead.acquiredByUserId;
  }

  const leadUpdate = db
    .update(leads)
    .set({ convertedOrganizationId: organizationId, stage: "converted", updatedAt: new Date() })
    .where(eq(leads.id, leadId));
  const activityInsert = db.insert(leadActivity).values({
    leadId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "converted",
    metadata: { organizationId, linkedExisting: true },
  });

  // Security Phase 20 — konverze vždy nastaví stage='converted', tedy
  // mimo ACTIVE_LEAD_STAGES → efektivní cílový termín (reconcileLeadCalendarEvent)
  // se stává null bez ohledu na next_follow_up_at, existující kalendářová
  // událost (pokud byla) se musí smazat.
  const calendarSyncUpsert = upsertPendingLeadCalendarSync(leadId);

  if (Object.keys(orgUpdates).length > 0) {
    await db.batch([
      leadUpdate,
      activityInsert,
      db.update(organizations).set(orgUpdates).where(eq(organizations.id, organizationId)),
      calendarSyncUpsert,
    ]);
  } else {
    await db.batch([leadUpdate, activityInsert, calendarSyncUpsert]);
  }

  await reconcileCalendarAfterCommit(leadId);

  return { ok: true };
}

// Varianta B konverze — založení NOVÉ organizace. Volá výhradně stávající
// createCustomerOrganization (admin.ts), beze změny a bez duplikace —
// tahle funkce si sama vynucuje requireAdminContext (ADMIN, ne EXECUTIVE),
// takže EXECUTIVE (dnes Jarda) touhle cestou lead nepřevede sám; musí
// požádat ADMINa, nebo použít Variantu A, pokud organizace už existuje.
// Schválený kompromis — CRM 1.0 nerozšiřuje, kdo smí zakládat platící
// zákazníky s přihlašovacím účtem, to zůstává výhradně na ADMINovi.
export async function convertLeadToNewOrganization(
  leadId: string,
  rawInput: CreateCustomerInput
): Promise<CreateCustomerResult> {
  const ctx = await requireCrmContext();

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  const result = await createCustomerOrganization(rawInput);
  if (!result.ok) {
    return result;
  }

  // Druhý, navazující zápis — createCustomerOrganization už svůj vlastní
  // atomický batch dokončila úspěšně. Pokud tenhle krok selže, organizace
  // existuje, ale bez CRM napojení — dohledatelné a opravitelné ručně
  // (owner/acquiredBy jde doplnit i dodatečně), není to ztráta dat.
  await db.batch([
    db
      .update(organizations)
      .set({ ownerUserId: lead.ownerUserId, acquiredByUserId: lead.acquiredByUserId })
      .where(eq(organizations.id, result.organizationId)),
    db
      .update(leads)
      .set({ convertedOrganizationId: result.organizationId, stage: "converted", updatedAt: new Date() })
      .where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "converted",
      metadata: { organizationId: result.organizationId, linkedExisting: false },
    }),
    // Security Phase 20 — stejný důvod jako u linkLeadToExistingOrganization:
    // stage='converted' je mimo ACTIVE_LEAD_STAGES, existující kalendářová
    // událost (pokud byla) se musí smazat.
    upsertPendingLeadCalendarSync(leadId),
  ]);

  await reconcileCalendarAfterCommit(leadId);

  return result;
}

// --- Moji/všichni zákazníci -------------------------------------------------

export type CustomerCardData = {
  id: string;
  name: string;
  ico: string;
  ownerUserId: string | null;
  ownerName: string | null;
  acquiredByUserId: string | null;
  acquiredByName: string | null;
  orderCount: number;
  totalRevenueKc: number;
  lastOrderAt: Date | null;
};

export type CustomerListFilter = "mine" | "all";

// Obrat = obchodní hodnota objednávek (SUM totalKc), NE cashflow — počítá
// se ze VŠECH objednávek kromě zrušených (fulfillmentStatus != cancelled),
// bez ohledu na paymentStatus (schváleno explicitně: "Objednáno" a
// "Uhrazeno" jsou dvě různé věci, tohle číslo je "Objednáno").
export async function listCustomers(filter: CustomerListFilter): Promise<CustomerCardData[]> {
  const ctx = await requireCrmContext();

  const orgRows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      ico: organizations.ico,
      ownerUserId: organizations.ownerUserId,
      acquiredByUserId: organizations.acquiredByUserId,
    })
    .from(organizations)
    .where(filter === "mine" ? eq(organizations.ownerUserId, ctx.userId) : undefined)
    .orderBy(asc(organizations.name));

  if (orgRows.length === 0) {
    return [];
  }

  const orgIds = orgRows.map((o) => o.id);
  const activeOrders = await db
    .select({
      buyerOrganizationId: orders.buyerOrganizationId,
      totalKc: orders.totalKc,
      orderedAt: orders.orderedAt,
    })
    .from(orders)
    .where(and(inArray(orders.buyerOrganizationId, orgIds), ne(orders.fulfillmentStatus, "cancelled")));

  const statsByOrg = new Map<string, { count: number; total: number; last: Date | null }>();
  for (const row of activeOrders) {
    if (!row.buyerOrganizationId) continue; // soukromý zákazník (SQL ho sem nepustí, jen pro typy)
    const current = statsByOrg.get(row.buyerOrganizationId) ?? { count: 0, total: 0, last: null };
    current.count += 1;
    current.total += row.totalKc;
    if (!current.last || row.orderedAt.getTime() > current.last.getTime()) {
      current.last = row.orderedAt;
    }
    statsByOrg.set(row.buyerOrganizationId, current);
  }

  const staffIds = [
    ...new Set(
      orgRows.flatMap((o) => [o.ownerUserId, o.acquiredByUserId]).filter((v): v is string => v !== null)
    ),
  ];
  const staff = await getUserProfiles(staffIds);

  return orgRows.map((org) => {
    const stats = statsByOrg.get(org.id) ?? { count: 0, total: 0, last: null };
    const owner = org.ownerUserId ? staff.get(org.ownerUserId) : null;
    const acquiredBy = org.acquiredByUserId ? staff.get(org.acquiredByUserId) : null;
    return {
      id: org.id,
      name: org.name,
      ico: org.ico,
      ownerUserId: org.ownerUserId,
      ownerName: owner?.name ?? owner?.email ?? null,
      acquiredByUserId: org.acquiredByUserId,
      acquiredByName: acquiredBy?.name ?? acquiredBy?.email ?? null,
      orderCount: stats.count,
      totalRevenueKc: stats.total,
      lastOrderAt: stats.last,
    };
  });
}

export async function assignCustomerOwner(organizationId: string, ownerUserId: string): Promise<LeadResult> {
  await requireCrmContext();

  const owner = await getUserProfile(ownerUserId);
  if (!owner) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  await db.update(organizations).set({ ownerUserId }).where(eq(organizations.id, organizationId));
  return { ok: true };
}

export async function setCustomerAcquiredBy(
  organizationId: string,
  acquiredByUserId: string
): Promise<LeadResult> {
  await requireCrmContext();

  const acquirer = await getUserProfile(acquiredByUserId);
  if (!acquirer) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  await db.update(organizations).set({ acquiredByUserId }).where(eq(organizations.id, organizationId));
  return { ok: true };
}

export type CustomerOrderSummary = {
  id: string;
  orderedAt: Date;
  totalKc: number;
  fulfillmentStatus: string;
};

export type CustomerActivityEntry = {
  id: string;
  kind: string;
  authorUserId: string;
  authorName: string | null;
  body: string | null;
  createdAt: Date;
};

export type CustomerDetail = CustomerCardData & {
  /** Fakturační jméno, když se liší od názvu karty (migrace 0056); null = faktura na name. */
  billingName: string | null;
  /** Sídlo podle IČO — jde na fakturu. */
  registeredAddress: string;
  /** Doručovací adresa (migrace 0063); null = vozí se na sídlo / adresu z objednávky. */
  deliveryAddress: string | null;
  recentOrders: CustomerOrderSummary[];
  activity: CustomerActivityEntry[];
};

export async function getCustomerDetail(organizationId: string): Promise<CustomerDetail | null> {
  await requireCrmContext();

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      billingName: organizations.billingName,
      registeredAddress: organizations.registeredAddress,
      deliveryAddress: organizations.deliveryAddress,
      ico: organizations.ico,
      ownerUserId: organizations.ownerUserId,
      acquiredByUserId: organizations.acquiredByUserId,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) {
    return null;
  }

  const orderRows = await db
    .select({
      id: orders.id,
      orderedAt: orders.orderedAt,
      totalKc: orders.totalKc,
      fulfillmentStatus: orders.fulfillmentStatus,
    })
    .from(orders)
    .where(eq(orders.buyerOrganizationId, organizationId))
    .orderBy(desc(orders.orderedAt));

  const activeOrders = orderRows.filter((o) => o.fulfillmentStatus !== "cancelled");
  const orderCount = activeOrders.length;
  const totalRevenueKc = activeOrders.reduce((sum, o) => sum + o.totalKc, 0);
  const lastOrderAt = activeOrders.length > 0 ? activeOrders[0].orderedAt : null;

  const activityRows = await db
    .select()
    .from(organizationActivity)
    .where(eq(organizationActivity.organizationId, organizationId))
    .orderBy(asc(organizationActivity.createdAt));

  const staffIds = [org.ownerUserId, org.acquiredByUserId].filter((v): v is string => v !== null);
  const staff = await getUserProfiles(staffIds);
  const owner = org.ownerUserId ? staff.get(org.ownerUserId) : null;
  const acquiredBy = org.acquiredByUserId ? staff.get(org.acquiredByUserId) : null;

  return {
    id: org.id,
    name: org.name,
    billingName: org.billingName ?? null,
    registeredAddress: org.registeredAddress,
    deliveryAddress: org.deliveryAddress ?? null,
    ico: org.ico,
    ownerUserId: org.ownerUserId,
    ownerName: owner?.name ?? owner?.email ?? null,
    acquiredByUserId: org.acquiredByUserId,
    acquiredByName: acquiredBy?.name ?? acquiredBy?.email ?? null,
    orderCount,
    totalRevenueKc,
    lastOrderAt,
    recentOrders: orderRows.slice(0, 10),
    activity: activityRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      authorUserId: r.authorUserId,
      authorName: r.authorName,
      body: r.body,
      createdAt: r.createdAt,
    })),
  };
}

// GPT/MCP pilot — poznámka u zákazníka (organizace po konverzi). Do teď
// neměl zákazník žádnou historii mimo objednávky — viz schema.ts
// organization_activity.
export async function addCustomerNote(organizationId: string, rawBody: string): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const validated = validateNoteInput(rawBody);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) {
    return { ok: false, error: "Zákazník nebyl nalezen." };
  }

  await db.insert(organizationActivity).values({
    organizationId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "note_added",
    body: validated.value,
  });

  return { ok: true };
}

// --- Hledání napříč leady a zákazníky ---------------------------------------

export type CrmSearchResult = {
  leads: (LeadCardData & { ico: string | null })[];
  customers: { id: string; name: string; ico: string }[];
};

const SEARCH_LIMIT = 20;

// GPT/MCP pilot — hledání podle názvu, kontaktu, telefonu, e-mailu, města
// nebo IČO. Na rozdíl od listLeads hledá i v ukončených leadech
// (not_interested, converted) — kvůli otázkám typu "co jsme řešili s X".
export async function searchCrm(rawQuery: string): Promise<CrmSearchResult> {
  await requireCrmContext();

  const query = rawQuery.trim();
  if (query.length < 2) {
    return { leads: [], customers: [] };
  }
  const pattern = likePattern(query);

  const leadRows = await db
    .select()
    .from(leads)
    .where(
      or(
        ilike(leads.companyName, pattern),
        ilike(leads.contactName, pattern),
        ilike(leads.contactPhone, pattern),
        ilike(leads.contactEmail, pattern),
        ilike(leads.city, pattern),
        ilike(leads.ico, pattern)
      )
    )
    .orderBy(desc(leads.updatedAt))
    .limit(SEARCH_LIMIT);

  const customerRows = await db
    .select({ id: organizations.id, name: organizations.name, ico: organizations.ico })
    .from(organizations)
    .where(or(ilike(organizations.name, pattern), ilike(organizations.billingName, pattern), ilike(organizations.ico, pattern)))
    .orderBy(asc(organizations.name))
    .limit(SEARCH_LIMIT);

  const cards = await buildLeadCards(leadRows);
  return {
    leads: cards.map((card, i) => ({ ...card, ico: leadRows[i].ico })),
    customers: customerRows,
  };
}

// Jardova karta (audit 15. 11. 2026): objednávky soukromé osoby navázané na
// kontakt přes orders.source_lead_id — pro detail kontaktu.
export async function listLeadSourceOrders(leadId: string) {
  await requireCrmContext();
  return db
    .select({ id: orders.id, orderNumber: orders.orderNumber, orderedAt: orders.orderedAt, totalKc: orders.totalKc })
    .from(orders)
    .where(eq(orders.sourceLeadId, leadId))
    .orderBy(asc(orders.orderedAt));
}

// --- Karta zákazníka: název, fakturační jméno, napojení leadu ----------------
// Jarin 19. 11. 2026: zákazník je ten, kdo s námi obchoduje (karta „Marek
// Baroš“), i když fakturační údaje dá na jiné jméno a IČO („Lenka Kermes“).
// name = název karty (CRM, objednávky, přehledy); billing_name = jméno na
// faktuře (NULL = faktura na name). IČO, DIČ a sídlo se tu nemění.

export type CustomerCardInput = {
  /** Nový název karty zákazníka; undefined = beze změny. */
  name?: string;
  /** Fakturační jméno; undefined = beze změny, null = smazat (faktura na name). */
  billingName?: string | null;
  /** Lead, který se ke kartě připojí (konverze na tuto existující kartu). */
  leadId?: string;
};

export { planCustomerCardChange };

export type CustomerCardResult =
  | {
      ok: true;
      changed: string[];
      customer: { id: string; name: string; billingName: string | null; invoiceName: string; ico: string };
      linkedLeadId: string | null;
    }
  | { ok: false; error: string };

export async function updateCustomerCard(organizationId: string, input: CustomerCardInput): Promise<CustomerCardResult> {
  const ctx = await requireCrmContext();
  if (input.name !== undefined && !input.name.trim()) return { ok: false, error: "Název karty nesmí být prázdný." };

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, billingName: organizations.billingName, ico: organizations.ico })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) return { ok: false, error: "Zákazník nebyl nalezen." };

  let lead: { id: string; convertedOrganizationId: string | null } | null = null;
  if (input.leadId) {
    const [row] = await db
      .select({ id: leads.id, convertedOrganizationId: leads.convertedOrganizationId })
      .from(leads)
      .where(eq(leads.id, input.leadId))
      .limit(1);
    if (!row) return { ok: false, error: "Lead nebyl nalezen." };
    if (row.convertedOrganizationId && row.convertedOrganizationId !== organizationId) {
      return { ok: false, error: "Lead je už připojený k jiné kartě zákazníka — nic se nezměnilo." };
    }
    lead = row;
  }

  const plan = planCustomerCardChange({ name: org.name, billingName: org.billingName }, input);
  const changed = [...plan.changed];

  if (plan.changed.length > 0) {
    await db.batch([
      db.update(organizations).set({ name: plan.name, billingName: plan.billingName }).where(eq(organizations.id, organizationId)),
      db.insert(organizationActivity).values({
        organizationId,
        authorUserId: ctx.userId,
        authorName: ctx.name,
        kind: "customer_updated",
        body: [
          plan.changed.includes("name") ? `Název karty: „${org.name}“ → „${plan.name}“` : null,
          plan.changed.includes("billing_name") ? `Fakturační jméno: ${org.billingName ? `„${org.billingName}“` : "—"} → ${plan.billingName ? `„${plan.billingName}“` : "— (faktura na název karty)"}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: { before: { name: org.name, billingName: org.billingName }, after: { name: plan.name, billingName: plan.billingName } },
      }),
    ]);
  }

  if (lead && lead.convertedOrganizationId !== organizationId) {
    const linked = await linkLeadToExistingOrganization(lead.id, organizationId);
    if (!linked.ok) return { ok: false, error: `Karta ${changed.length ? "je upravená, ale " : ""}lead se nepodařilo připojit: ${linked.error}` };
    changed.push("lead");
  }

  return {
    ok: true,
    changed,
    customer: { id: org.id, name: plan.name, billingName: plan.billingName, invoiceName: plan.billingName ?? plan.name, ico: org.ico },
    linkedLeadId: lead?.id ?? null,
  };
}

/**
 * Doručovací adresa zákazníka (Lucie 23. 11. 2026). Sídlo (faktura) se nemění;
 * prázdný text adresu smaže. Změna se zapíše do historie karty.
 */
export async function setCustomerDeliveryAddress(organizationId: string, raw: string): Promise<LeadResult> {
  const ctx = await requireCrmContext();
  const address = raw.replace(/\s+/g, " ").trim();
  if (address.length > 300) return { ok: false, error: "Adresa je moc dlouhá." };
  if (address.length > 0 && address.length < 5) return { ok: false, error: "Napište celou adresu (ulice, číslo, PSČ, město)." };
  const [org] = await db
    .select({ old: organizations.deliveryAddress })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) return { ok: false, error: "Zákazník nebyl nalezen." };
  const next = address || null;
  if ((org.old ?? null) === next) return { ok: true };
  await db.batch([
    db.update(organizations).set({ deliveryAddress: next }).where(eq(organizations.id, organizationId)),
    db.insert(organizationActivity).values({
      organizationId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "note_added",
      body: next
        ? org.old
          ? `Doručovací adresa změněna: ${org.old} → ${next}`
          : `Doplněna doručovací adresa: ${next}`
        : `Doručovací adresa smazána (byla: ${org.old})`,
    }),
  ]);
  return { ok: true };
}

export type ConvertLeadToCompanyInput = {
  name: string;
  ico: string;
  registeredAddress: string;
  deliveryAddress?: string | null;
};

/**
 * Převod leadu na zákazníka (firmu) BEZ zakládání přihlašovacího účtu —
 * pro asistenta (Lucie 25. 11. 2026). Firma se najde podle IČO, nebo založí
 * (jako při zápisu objednávky). Lead → stage converted, obchodník z leadu.
 * E-shopové objednávky se stejným fakturačním IČO bez zákazníka se ke kartě
 * připojí, aby karta ukazovala obrat a historii.
 */
export async function convertLeadToCompany(
  leadId: string,
  input: ConvertLeadToCompanyInput
): Promise<{ ok: true; organizationId: string; created: boolean; linkedOrders: number } | { ok: false; error: string }> {
  const ctx = await requireCrmContext();
  const ico = input.ico.replace(/\s+/g, "");
  if (!/^\d{8}$/.test(ico)) return { ok: false, error: "IČO musí mít 8 číslic." };
  const name = input.name.trim();
  const address = input.registeredAddress.replace(/\s+/g, " ").trim();
  if (name.length < 2) return { ok: false, error: "Chybí název firmy." };
  if (address.length < 5) return { ok: false, error: "Chybí adresa sídla." };

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { ok: false, error: "Lead nebyl nalezen." };
  if (lead.convertedOrganizationId) return { ok: false, error: "Lead už je převedený na zákazníka." };

  const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.ico, ico)).limit(1);
  const organizationId = existing?.id ?? randomUUID();
  const delivery = input.deliveryAddress?.replace(/\s+/g, " ").trim() || null;

  const ops = [];
  if (!existing) {
    ops.push(
      db.insert(organizations).values({
        id: organizationId,
        ico,
        name,
        registeredAddress: address,
        deliveryAddress: delivery,
        ownerUserId: lead.ownerUserId,
        acquiredByUserId: lead.acquiredByUserId,
      }),
      db.insert(organizationActivity).values({
        organizationId,
        authorUserId: ctx.userId,
        authorName: ctx.name,
        kind: "created",
        metadata: { fromLeadId: leadId },
      })
    );
  }
  ops.push(
    db
      .update(leads)
      .set({ convertedOrganizationId: organizationId, stage: "converted", updatedAt: new Date() })
      .where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "converted",
      metadata: { organizationId, linkedExisting: Boolean(existing) },
    }),
    upsertPendingLeadCalendarSync(leadId)
  );
  await db.batch(ops as unknown as Parameters<typeof db.batch>[0]);
  if (existing && delivery) {
    await db.update(organizations).set({ deliveryAddress: delivery }).where(and(eq(organizations.id, organizationId), isNull(organizations.deliveryAddress)));
  }

  const linked = await db
    .update(orders)
    .set({ buyerOrganizationId: organizationId })
    .where(and(isNull(orders.buyerOrganizationId), eq(orders.billingIco, ico)))
    .returning({ id: orders.id });

  await reconcileCalendarAfterCommit(leadId);
  return { ok: true, organizationId, created: !existing, linkedOrders: linked.length };
}

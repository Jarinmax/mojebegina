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
import { randomUUID } from "crypto";
import { and, asc, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, leadActivity, organizations, orders, userRoles } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireCrmAccess } from "./crmAuth";
import { createCustomerOrganization, type CreateCustomerResult } from "./admin";
import type { CreateCustomerInput } from "./createCustomerValidation";
import { getUserProfile, getUserProfiles } from "./userProfiles";
import {
  validateCreateLeadInput,
  validateStageInput,
  validateCallLogInput,
  isFollowUpOverdue,
  ACTIVE_LEAD_STAGES,
  type CreateLeadInput,
  type CallLogInput,
  type LeadStage,
} from "./leadValidation";
import type { AuthContext } from "./types";

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
  companyName: string;
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

  const cards = await buildLeadCards(rows);

  // Naléhavost napřed: po termínu → nejbližší follow-up → bez follow-upu
  // (nejnovější první). Dělá z "Moje leady" přirozený kokpit bez nutnosti
  // dalšího filtrování — přesně to, co je v CockpitTiles vidět jako počty,
  // je tu vidět i jako první řádky.
  return cards.sort((a, b) => {
    if (a.followUpOverdue !== b.followUpOverdue) return a.followUpOverdue ? -1 : 1;
    if (a.nextFollowUpAt && b.nextFollowUpAt) {
      return a.nextFollowUpAt.getTime() - b.nextFollowUpAt.getTime();
    }
    if (a.nextFollowUpAt) return -1;
    if (b.nextFollowUpAt) return 1;
    return 0;
  });
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

export type LeadDetail = {
  lead: LeadCardData & {
    address: string | null;
    ico: string | null;
    acquiredByUserId: string | null;
    acquiredByName: string | null;
    convertedOrganizationId: string | null;
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
export async function logCallOutcome(leadId: string, rawInput: CallLogInput): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const validated = validateCallLogInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const value = validated.value;

  const [current] = await db.select({ stage: leads.stage }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!current) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  const updates: Partial<typeof leads.$inferInsert> = {
    lastContactedAt: new Date(),
    updatedAt: new Date(),
  };
  if (value.nextStage) {
    updates.stage = value.nextStage;
  }
  if (value.nextFollowUpAt !== null) {
    updates.nextFollowUpAt = value.nextFollowUpAt;
  }
  if (value.nextStepNote !== null) {
    updates.nextStepNote = value.nextStepNote;
  }

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
      },
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
  ]);

  return { ok: true };
}

export async function assignLeadOwner(leadId: string, ownerUserId: string): Promise<LeadResult> {
  const ctx = await requireCrmContext();

  const owner = await getUserProfile(ownerUserId);
  if (!owner) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) {
    return { ok: false, error: "Lead nebyl nalezen." };
  }

  await db.batch([
    db.update(leads).set({ ownerUserId, updatedAt: new Date() }).where(eq(leads.id, leadId)),
    db.insert(leadActivity).values({
      leadId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "owner_assigned",
      metadata: { ownerUserId, ownerName: owner.name ?? owner.email },
    }),
  ]);

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
    const orgIds = [...new Set(matchingOrders.map((o) => o.buyerOrganizationId))];
    if (orgIds.length > 0) {
      contactMatches = await db.select(selectCols).from(organizations).where(inArray(organizations.id, orgIds));
    }
  }

  const nameMatches =
    lead.companyName.trim().length >= 3
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

  if (Object.keys(orgUpdates).length > 0) {
    await db.batch([
      leadUpdate,
      activityInsert,
      db.update(organizations).set(orgUpdates).where(eq(organizations.id, organizationId)),
    ]);
  } else {
    await db.batch([leadUpdate, activityInsert]);
  }

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
  ]);

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

export type CustomerDetail = CustomerCardData & { recentOrders: CustomerOrderSummary[] };

export async function getCustomerDetail(organizationId: string): Promise<CustomerDetail | null> {
  await requireCrmContext();

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
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

  const staffIds = [org.ownerUserId, org.acquiredByUserId].filter((v): v is string => v !== null);
  const staff = await getUserProfiles(staffIds);
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
    orderCount,
    totalRevenueKc,
    lastOrderAt,
    recentOrders: orderRows.slice(0, 10),
  };
}

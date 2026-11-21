// Jardova karta — zákazníci, odměny podle Dohody o odměňování prodejce ze dne
// 14. 11. 2026 (výpočet: jardaRewardsValidation.ts) a výplaty Jaroslava
// Blahouta. Výplaty se evidují v collaborator_payouts u Jardovy karty
// spolupracovníka (stejně jako u Lucie).
//
// Přístup: Jarda (vlastní karta; u svého kontaktu před oslovením jen NAVRHNE
// typ zákazníka podle dohody, případně návrh stáhne) a vedoucí (Viner: návrh
// potvrdí nebo zamítne, může typ zapsat rovnou, zapisuje výplaty). Odměna se
// počítá jen z potvrzeného typu — sazby určuje dohoda, ne prodejce.
import "server-only";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  collaboratorCards,
  collaboratorPayouts,
  leadActivity,
  leads,
  orderItems,
  orders,
  productVariants,
  products,
  sellerRewardAssignments,
} from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import { isWorkManager, LUCIE_USER_ID } from "./workTasksAuth";
import { leadDisplayName } from "./leadValidation";
import { DAILY_CALL_LEAD_OWNER_USER_ID } from "./dailyCallsAuth";
import {
  computeJardaRewards,
  monthlyStatements,
  REWARD_TYPE_LABEL,
  type RewardAssignment,
  type RewardLead,
  type RewardOrder,
  type RewardType,
} from "./jardaRewardsValidation";
import type { AuthContext } from "./types";

export const JARDA_USER_ID = DAILY_CALL_LEAD_OWNER_USER_ID; // Jaroslav Blahout
export const JARDA_CARD_ID = "6a617264-612d-4000-8000-000000000001"; // scripts/migrate-jarda-karta.mjs

/**
 * Vedení Jardovy karty: Jaroslav Viner a Lucie Königsbergová (stejná práva —
 * rozhodnutí 21. 11. 2026): vidí celou kartu, potvrzují návrhy, zapisují výplaty
 * a svěřené peníze.
 */
export function isJardaCardManager(ctx: AuthContext): boolean {
  return isWorkManager(ctx) || (ctx !== null && !ctx.roleSelectionRequired && ctx.userId === LUCIE_USER_ID);
}

export function canViewJardaRewards(ctx: AuthContext): boolean {
  return ctx !== null && !ctx.roleSelectionRequired && (ctx.userId === JARDA_USER_ID || isJardaCardManager(ctx));
}

async function requireAccess(): Promise<{ ctx: NonNullable<AuthContext>; isManager: boolean }> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthenticatedError();
  if (!canViewJardaRewards(ctx)) throw new ForbiddenError();
  return { ctx, isManager: isJardaCardManager(ctx) };
}

const toAssignment = (a: typeof sellerRewardAssignments.$inferSelect): RewardAssignment => ({
  leadId: a.leadId,
  type: a.rewardType as RewardType,
  basis: a.basis as RewardAssignment["basis"],
  recordedAt: a.recordedAt,
  confirmedAt: a.confirmedAt,
  upsellProductIds: a.upsellProductIds,
  note: a.note,
});

export async function getJardaRewardsView() {
  const { isManager } = await requireAccess();

  const leadRows = await db
    .select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      contactEmail: leads.contactEmail,
      contactPhone: leads.contactPhone,
      convertedOrganizationId: leads.convertedOrganizationId,
    })
    .from(leads)
    .where(eq(leads.ownerUserId, JARDA_USER_ID));
  const leadIds = leadRows.map((l) => l.id);

  const [callRows, assignmentRows] = leadIds.length
    ? await Promise.all([
        db
          .select({ leadId: leadActivity.leadId, createdAt: leadActivity.createdAt })
          .from(leadActivity)
          .where(and(inArray(leadActivity.leadId, leadIds), eq(leadActivity.kind, "call_logged"), eq(leadActivity.authorUserId, JARDA_USER_ID))),
        db
          .select()
          .from(sellerRewardAssignments)
          .where(and(inArray(sellerRewardAssignments.leadId, leadIds), isNull(sellerRewardAssignments.cancelledAt))),
      ])
    : [[], []];

  const callsByLead = new Map<string, Date[]>();
  for (const c of callRows) callsByLead.set(c.leadId, [...(callsByLead.get(c.leadId) ?? []), c.createdAt]);
  const rewardLeads: RewardLead[] = leadRows.map((r) => ({
    id: r.id,
    displayName: leadDisplayName(r),
    convertedOrganizationId: r.convertedOrganizationId,
    jardaCallTimes: callsByLead.get(r.id) ?? [],
  }));

  const orgIds = rewardLeads.map((l) => l.convertedOrganizationId).filter((id): id is string => id !== null);
  const conditions = [
    ...(leadIds.length ? [inArray(orders.sourceLeadId, leadIds)] : []),
    ...(orgIds.length ? [inArray(orders.buyerOrganizationId, orgIds)] : []),
  ];
  const orderRows = conditions.length
    ? await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          orderedAt: orders.orderedAt,
          paidAt: orders.paidAt,
          buyerOrganizationId: orders.buyerOrganizationId,
          sourceLeadId: orders.sourceLeadId,
          subtotalKc: orders.subtotalKc,
          discountKc: orders.discountKc,
          paymentStatus: orders.paymentStatus,
          fulfillmentStatus: orders.fulfillmentStatus,
        })
        .from(orders)
        .where(or(...conditions))
    : [];
  const itemRows = orderRows.length
    ? await db
        .select({ orderId: orderItems.orderId, name: orderItems.name, lineTotalKc: orderItems.lineTotalKc, productId: productVariants.productId })
        .from(orderItems)
        .leftJoin(productVariants, eq(productVariants.id, orderItems.productVariantId))
        .where(inArray(orderItems.orderId, orderRows.map((o) => o.id)))
    : [];
  const rewardOrders: RewardOrder[] = orderRows.map((o) => ({
    ...o,
    orderNumber: o.orderNumber === null ? null : String(o.orderNumber),
    items: itemRows.filter((i) => i.orderId === o.id).map((i) => ({ productId: i.productId, productName: i.name, lineTotalKc: i.lineTotalKc })),
  }));

  const { customers, excluded } = computeJardaRewards(rewardLeads, assignmentRows.map(toAssignment), rewardOrders);

  const payouts = await db
    .select({ id: collaboratorPayouts.id, amountKc: collaboratorPayouts.amountKc, note: collaboratorPayouts.note, paidAt: collaboratorPayouts.paidAt })
    .from(collaboratorPayouts)
    .where(eq(collaboratorPayouts.cardId, JARDA_CARD_ID))
    .orderBy(desc(collaboratorPayouts.paidAt));
  const paidOutKc = payouts.reduce((sum, p) => sum + p.amountKc, 0);
  const earnedKc = Math.round(customers.reduce((s, c) => s + c.totalKc, 0) * 100) / 100;

  const nameOf = (leadId: string) => rewardLeads.find((l) => l.id === leadId)?.displayName ?? "—";
  // Potvrzení, kteří zatím nenakoupili (bez objednávek není co počítat ani vyřazovat).
  const customerIds = new Set([...customers.map((c) => c.leadId), ...excluded.map((e) => e.leadId)]);
  const pending = assignmentRows
    .filter((a) => a.confirmedAt !== null && !customerIds.has(a.leadId))
    .map((a) => ({ leadId: a.leadId, displayName: nameOf(a.leadId), type: a.rewardType as RewardType, recordedAt: a.recordedAt }));

  // Jardovy návrhy čekající na potvrzení vedením.
  const proposalRows = assignmentRows.filter((a) => a.confirmedAt === null);
  const proposalProductIds = [...new Set(proposalRows.flatMap((a) => a.upsellProductIds))];
  const productNames = new Map(
    proposalProductIds.length
      ? (await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, proposalProductIds))).map((p) => [p.id, p.name])
      : []
  );
  const proposals = proposalRows
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
    .map((a) => ({
      leadId: a.leadId,
      displayName: nameOf(a.leadId),
      type: a.rewardType as RewardType,
      proposedAt: a.recordedAt,
      note: a.note,
      upsellProducts: a.upsellProductIds.map((id) => productNames.get(id) ?? "neznámý produkt"),
      hasOrders: excluded.some((e) => e.leadId === a.leadId),
    }));

  return {
    isManager,
    customers,
    pending,
    proposals,
    // Kdo objednal, ale odměna mu nenáleží (s důvodem) — jen pro vedoucího.
    excluded: isManager ? excluded : [],
    statements: monthlyStatements(customers),
    payouts,
    summary: {
      customerCount: customers.length,
      earnedKc,
      paidOutKc,
      remainingKc: Math.round((earnedKc - paidOutKc) * 100) / 100,
    },
  };
}

export type JardaRewardsView = Awaited<ReturnType<typeof getJardaRewardsView>>;

// --- Evidence typu odměňování (bod 4 dohody) ---------------------------------

export type RewardAssignmentView = {
  type: RewardType;
  typeLabel: string;
  basis: string;
  recordedAt: Date;
  confirmedAt: Date | null;
  note: string | null;
  upsellProducts: string[];
};

export async function getLeadRewardAssignment(leadId: string): Promise<{
  visible: boolean;
  isManager: boolean;
  canRecord: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  assignment: RewardAssignmentView | null;
  products: { id: string; name: string }[];
}> {
  const ctx = await getAuthContext();
  const none = { visible: false, isManager: false, canRecord: false, canConfirm: false, canCancel: false, assignment: null, products: [] };
  if (!canViewJardaRewards(ctx)) return none;
  const [lead] = await db.select({ ownerUserId: leads.ownerUserId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  // Kontakt bez vlastníka (nový lead, např. z Mety) — návrh jde podat před prvním hovorem.
  if (!lead || (lead.ownerUserId !== null && lead.ownerUserId !== JARDA_USER_ID)) return none;

  const [row] = await db
    .select()
    .from(sellerRewardAssignments)
    .where(and(eq(sellerRewardAssignments.leadId, leadId), isNull(sellerRewardAssignments.cancelledAt)))
    .limit(1);
  const productList = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.isActive, true)).orderBy(asc(products.name));
  const nameById = new Map(productList.map((p) => [p.id, p.name]));

  return {
    visible: true,
    isManager: isJardaCardManager(ctx),
    canRecord: !row,
    canConfirm: !!row && row.confirmedAt === null && isJardaCardManager(ctx),
    // vedoucí zamítne návrh / zruší evidenci; Jarda smí stáhnout jen svůj nepotvrzený návrh
    canCancel: !!row && (isJardaCardManager(ctx) || row.confirmedAt === null),
    assignment: row
      ? {
          type: row.rewardType as RewardType,
          typeLabel: REWARD_TYPE_LABEL[row.rewardType as RewardType] ?? row.rewardType,
          basis: row.basis,
          recordedAt: row.recordedAt,
          confirmedAt: row.confirmedAt,
          note: row.note,
          upsellProducts: row.upsellProductIds.map((id) => nameById.get(id) ?? "neznámý produkt"),
        }
      : null,
    products: productList,
  };
}

export type RewardActionResult = { ok: true } | { ok: false; error: string };

/**
 * Jarda typ zákazníka podle dohody jen NAVRHNE (počítá se až po potvrzení);
 * zapíše-li ho vedoucí, je potvrzený hned.
 */
export async function recordRewardAssignment(input: { leadId: string; type: string; productIds: string[]; note: string }): Promise<RewardActionResult> {
  const { ctx, isManager } = await requireAccess();
  if (!["new", "renewed", "upsell"].includes(input.type)) return { ok: false, error: "Vyberte typ zákazníka." };
  const type = input.type as RewardType;
  const productIds = type === "upsell" ? [...new Set(input.productIds)] : [];
  if (type === "upsell" && productIds.length === 0) return { ok: false, error: "U dalšího produktu vyberte, který produkt budete nabízet." };

  const [lead] = await db.select({ ownerUserId: leads.ownerUserId }).from(leads).where(eq(leads.id, input.leadId)).limit(1);
  if (!lead || (lead.ownerUserId !== null && lead.ownerUserId !== JARDA_USER_ID)) return { ok: false, error: "Kontakt nepatří prodejci." };
  if (productIds.length) {
    const found = await db.select({ id: products.id }).from(products).where(inArray(products.id, productIds));
    if (found.length !== productIds.length) return { ok: false, error: "Neznámý produkt." };
  }

  const note = input.note.trim().slice(0, 500) || null;
  const inserted = await db
    .insert(sellerRewardAssignments)
    .values({
      leadId: input.leadId,
      sellerUserId: JARDA_USER_ID,
      rewardType: type,
      basis: "contract",
      upsellProductIds: productIds,
      note,
      recordedBy: ctx.userId,
      ...(isManager ? { confirmedAt: new Date(), confirmedBy: ctx.userId } : {}),
    })
    .onConflictDoNothing()
    .returning({ id: sellerRewardAssignments.id });
  if (inserted.length === 0) return { ok: false, error: "Kontakt už má návrh nebo potvrzený typ zákazníka." };

  await db.insert(leadActivity).values({
    leadId: input.leadId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "note_added",
    body: isManager
      ? `Typ zákazníka podle dohody o odměňování: ${REWARD_TYPE_LABEL[type]} (zapsalo a potvrdilo vedení)${note ? ` — ${note}` : ""}.`
      : `Návrh typu zákazníka podle dohody o odměňování: ${REWARD_TYPE_LABEL[type]} — čeká na potvrzení vedením${note ? ` (${note})` : ""}.`,
    metadata: { rewardAssignment: type, productIds, confirmed: isManager },
  });
  return { ok: true };
}

/** Vedoucí potvrdí Jardův návrh typu zákazníka — teprve pak se odměna počítá. */
export async function confirmRewardAssignment(leadId: string): Promise<RewardActionResult> {
  const { ctx, isManager } = await requireAccess();
  if (!isManager) throw new ForbiddenError();
  const updated = await db
    .update(sellerRewardAssignments)
    .set({ confirmedAt: new Date(), confirmedBy: ctx.userId })
    .where(and(eq(sellerRewardAssignments.leadId, leadId), isNull(sellerRewardAssignments.cancelledAt), isNull(sellerRewardAssignments.confirmedAt)))
    .returning({ type: sellerRewardAssignments.rewardType });
  if (updated.length === 0) return { ok: false, error: "Návrh k potvrzení nenalezen." };
  await db.insert(leadActivity).values({
    leadId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "note_added",
    body: `Vedení potvrdilo typ zákazníka podle dohody o odměňování: ${REWARD_TYPE_LABEL[updated[0].type as RewardType] ?? updated[0].type}.`,
    metadata: { rewardAssignmentConfirmed: updated[0].type },
  });
  return { ok: true };
}

/**
 * Vedoucí zamítne návrh nebo zruší potvrzený typ; Jarda smí stáhnout jen svůj
 * dosud nepotvrzený návrh. Nic se nemaže (cancelled_at).
 */
export async function cancelRewardAssignment(leadId: string): Promise<RewardActionResult> {
  const { ctx, isManager } = await requireAccess();
  const conditions = [eq(sellerRewardAssignments.leadId, leadId), isNull(sellerRewardAssignments.cancelledAt)];
  if (!isManager) {
    const [lead] = await db.select({ ownerUserId: leads.ownerUserId }).from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead || (lead.ownerUserId !== null && lead.ownerUserId !== JARDA_USER_ID)) throw new ForbiddenError();
    conditions.push(isNull(sellerRewardAssignments.confirmedAt));
  }
  const updated = await db
    .update(sellerRewardAssignments)
    .set({ cancelledAt: new Date(), cancelledBy: ctx.userId })
    .where(and(...conditions))
    .returning({ type: sellerRewardAssignments.rewardType, confirmedAt: sellerRewardAssignments.confirmedAt });
  if (updated.length === 0) return { ok: false, error: isManager ? "Návrh ani potvrzený typ nenalezen." : "Nepotvrzený návrh nenalezen." };
  const label = REWARD_TYPE_LABEL[updated[0].type as RewardType] ?? updated[0].type;
  const body = !isManager
    ? `Návrh typu zákazníka stažen (${label}).`
    : updated[0].confirmedAt
      ? `Vedení zrušilo potvrzený typ zákazníka (${label}).`
      : `Vedení zamítlo návrh typu zákazníka (${label}).`;
  await db.insert(leadActivity).values({
    leadId,
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "note_added",
    body,
    metadata: { rewardAssignmentCancelled: updated[0].type, wasConfirmed: updated[0].confirmedAt !== null },
  });
  return { ok: true };
}

/** Počet Jardových návrhů typu zákazníka čekajících na potvrzení (pro odkaz na /prace). */
export async function countPendingRewardProposals(): Promise<number> {
  const ctx = await getAuthContext();
  if (!canViewJardaRewards(ctx)) return 0;
  const rows = await db
    .select({ id: sellerRewardAssignments.id })
    .from(sellerRewardAssignments)
    .where(and(eq(sellerRewardAssignments.sellerUserId, JARDA_USER_ID), isNull(sellerRewardAssignments.cancelledAt), isNull(sellerRewardAssignments.confirmedAt)));
  return rows.length;
}

// --- Výplaty -------------------------------------------------------------------

export async function addJardaPayout(input: { amountKc: number; note: string; paidOn: string }): Promise<RewardActionResult> {
  const { ctx, isManager } = await requireAccess();
  if (!isManager) throw new ForbiddenError();

  const amount = Math.round(Number(input.amountKc));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return { ok: false, error: "Zadejte kladnou částku v Kč." };
  }
  const note = input.note.trim().slice(0, 500) || null;
  let paidAt = new Date();
  if (input.paidOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) return { ok: false, error: "Neplatné datum výplaty." };
    paidAt = new Date(`${input.paidOn}T12:00:00.000Z`);
  }

  // Karta vzniká při nasazení (scripts/migrate-jarda-karta.mjs); pojistka pro
  // prostředí, kde skript neběžel — založení i zápis v jedné transakci.
  await db.batch([
    db
      .insert(collaboratorCards)
      .values({ id: JARDA_CARD_ID, displayName: "Jaroslav Blahout – obchod a volání", assigneeUserId: JARDA_USER_ID, defaultCommissionPercent: 0, createdBy: ctx.userId })
      .onConflictDoNothing(),
    db.insert(collaboratorPayouts).values({ cardId: JARDA_CARD_ID, amountKc: amount, note, paidAt, createdBy: ctx.userId }),
  ]);
  return { ok: true };
}

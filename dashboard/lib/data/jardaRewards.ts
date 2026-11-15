// Jardova karta (audit 15. 11. 2026) — zákazníci, zaplacené zboží, odměny a
// výplaty Jaroslava Blahouta. Kdo náleží Jardovi, rozhoduje čistá funkce
// attributeJardaCustomers (jardaRewardsValidation.ts). Výplaty se evidují
// v collaborator_payouts u Jardovy karty spolupracovníka (stejně jako u Lucie).
//
// Přístup: Jarda (vlastní karta, jen čtení) a vedoucí (Viner, zápis výplat).
import "server-only";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { collaboratorCards, collaboratorPayouts, leads, orders } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import { isWorkManager } from "./workTasksAuth";
import { leadDisplayName } from "./leadValidation";
import { DAILY_CALL_LEAD_OWNER_USER_ID } from "./dailyCallsAuth";
import { attributeJardaCustomers, type RewardLeadRow, type RewardOrderRow } from "./jardaRewardsValidation";
import { computeJardaRewards, JARDA_REWARD_TERMS } from "./jardaRewardTerms";
import type { AuthContext } from "./types";

export const JARDA_USER_ID = DAILY_CALL_LEAD_OWNER_USER_ID; // Jaroslav Blahout
export const JARDA_CARD_ID = "6a617264-612d-4000-8000-000000000001"; // scripts/migrate-jarda-karta.mjs

export function canViewJardaRewards(ctx: AuthContext): boolean {
  return ctx !== null && !ctx.roleSelectionRequired && (ctx.userId === JARDA_USER_ID || isWorkManager(ctx));
}

async function requireAccess(): Promise<{ ctx: NonNullable<AuthContext>; isManager: boolean }> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthenticatedError();
  if (!canViewJardaRewards(ctx)) throw new ForbiddenError();
  return { ctx, isManager: isWorkManager(ctx) };
}

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
      firstJardaCallAt: sql<string | null>`(
        SELECT min(la.created_at) FROM lead_activity la
         WHERE la.lead_id = "leads"."id" AND la.kind = 'call_logged' AND la.author_user_id = ${JARDA_USER_ID}
      )`,
    })
    .from(leads)
    .where(eq(leads.ownerUserId, JARDA_USER_ID));

  const rewardLeads: RewardLeadRow[] = leadRows.map((r) => ({
    id: r.id,
    displayName: leadDisplayName(r),
    convertedOrganizationId: r.convertedOrganizationId,
    firstJardaCallAt: r.firstJardaCallAt ? new Date(r.firstJardaCallAt) : null,
  }));

  const leadIds = rewardLeads.map((l) => l.id);
  const orgIds = rewardLeads.map((l) => l.convertedOrganizationId).filter((id): id is string => id !== null);
  const conditions = [
    ...(leadIds.length ? [inArray(orders.sourceLeadId, leadIds)] : []),
    ...(orgIds.length ? [inArray(orders.buyerOrganizationId, orgIds)] : []),
  ];
  const orderRows: RewardOrderRow[] = conditions.length
    ? (
        await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            orderedAt: orders.orderedAt,
            buyerOrganizationId: orders.buyerOrganizationId,
            sourceLeadId: orders.sourceLeadId,
            subtotalKc: orders.subtotalKc,
            discountKc: orders.discountKc,
            paymentStatus: orders.paymentStatus,
            fulfillmentStatus: orders.fulfillmentStatus,
          })
          .from(orders)
          .where(or(...conditions))
      ).map((o) => ({ ...o, orderNumber: o.orderNumber === null ? null : String(o.orderNumber) }))
    : [];

  const { customers, excluded } = attributeJardaCustomers(rewardLeads, orderRows);

  const payouts = await db
    .select({ id: collaboratorPayouts.id, amountKc: collaboratorPayouts.amountKc, note: collaboratorPayouts.note, paidAt: collaboratorPayouts.paidAt })
    .from(collaboratorPayouts)
    .where(eq(collaboratorPayouts.cardId, JARDA_CARD_ID))
    .orderBy(desc(collaboratorPayouts.paidAt));
  const paidOutKc = payouts.reduce((sum, p) => sum + p.amountKc, 0);

  const rewards = computeJardaRewards(customers, JARDA_REWARD_TERMS);

  return {
    isManager,
    customers,
    // Kdo objednal bez Jardova hovoru předem — jen pro vedoucího (kontrola).
    excluded: isManager ? excluded : [],
    payouts,
    summary: {
      customerCount: customers.length,
      paidGoodsKc: customers.reduce((sum, c) => sum + c.paidGoodsKc, 0),
      rewards,
      paidOutKc,
      remainingKc: rewards.totalKc === null ? null : rewards.totalKc - paidOutKc,
    },
  };
}

export type JardaRewardsView = Awaited<ReturnType<typeof getJardaRewardsView>>;

export type AddJardaPayoutResult = { ok: true } | { ok: false; error: string };

export async function addJardaPayout(input: { amountKc: number; note: string; paidOn: string }): Promise<AddJardaPayoutResult> {
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

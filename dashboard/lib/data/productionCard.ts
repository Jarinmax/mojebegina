import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  organizations,
  orderItems,
  orders,
  productionCards,
  productionStockRequests,
  stockItemBalances,
  stockItems,
  userActivations,
  userProfiles,
  userRoles,
} from "@/lib/db/schema";
import { auth } from "@/lib/auth/server";
import { inviteCustomer } from "./admin";
import { upsertUserProfile, upsertUserProfileStatement } from "./userProfiles";
import { getAuthContext } from "./authContext";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import {
  assignmentInputSchema,
  inviteCollaboratorInputSchema,
} from "./collaboratorCardsValidation";
import { PETR_PRODUCTION_CARD_ID, stockRequestInputSchema } from "./productionCardValidation";

type CardAccess = { userId: string; isAdmin: boolean; isOwner: boolean };

/** Objednávky, které ještě čekají na výrobu (ne už hotové/vydané/zrušené). */
const QUEUE_STATUSES = ["new", "confirmed", "preparing"] as const;
/** Nedávno vyrobené (pro krátkou historii na kartě). */
const PRODUCED_STATUSES = ["ready", "out_for_delivery", "delivered"] as const;

export async function getCurrentProductionLanding(userId: string): Promise<string | null> {
  const [card] = await db.select({ id: productionCards.id })
    .from(productionCards)
    .where(eq(productionCards.assigneeUserId, userId))
    .limit(1);
  return card?.id === PETR_PRODUCTION_CARD_ID ? "/vyroba/petr" : null;
}

async function requireCardAccess(cardId: string, write: boolean): Promise<CardAccess> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthenticatedError();
  if (ctx.roleSelectionRequired) throw new ForbiddenError();

  const [card] = await db
    .select({ assigneeUserId: productionCards.assigneeUserId })
    .from(productionCards)
    .where(eq(productionCards.id, cardId))
    .limit(1);
  if (!card) throw new Error("Karta výroby nebyla nalezena.");

  const isAdmin = ctx.systemRole === "ADMIN";
  const isOwner = card.assigneeUserId === ctx.userId;
  if (!isAdmin && !isOwner) throw new ForbiddenError();
  if (write && !isAdmin && !isOwner) throw new ForbiddenError();
  return { userId: ctx.userId, isAdmin, isOwner };
}

export type ProductionCardView = Awaited<ReturnType<typeof getProductionCard>>;

export async function getProductionCard() {
  const cardId = PETR_PRODUCTION_CARD_ID;
  const access = await requireCardAccess(cardId, false);
  const [card] = await db.select().from(productionCards).where(eq(productionCards.id, cardId)).limit(1);
  if (!card) throw new Error("Karta výroby nebyla nalezena.");

  const [queueOrders, producedOrders, stockRows, requests, assignee] = await Promise.all([
    db.select({
      id: orders.id,
      contactName: orders.contactName,
      recipientName: orders.recipientName,
      organizationName: organizations.name,
      fulfillmentStatus: orders.fulfillmentStatus,
      plannedDeliveryAt: orders.plannedDeliveryAt,
      orderedAt: orders.orderedAt,
    }).from(orders)
      .leftJoin(organizations, eq(organizations.id, orders.buyerOrganizationId))
      .where(inArray(orders.fulfillmentStatus, [...QUEUE_STATUSES]))
      .orderBy(asc(orders.plannedDeliveryAt), asc(orders.orderedAt)),
    db.select({
      id: orders.id,
      contactName: orders.contactName,
      recipientName: orders.recipientName,
      organizationName: organizations.name,
      fulfillmentStatus: orders.fulfillmentStatus,
      plannedDeliveryAt: orders.plannedDeliveryAt,
      orderedAt: orders.orderedAt,
    }).from(orders)
      .leftJoin(organizations, eq(organizations.id, orders.buyerOrganizationId))
      .where(inArray(orders.fulfillmentStatus, [...PRODUCED_STATUSES]))
      .orderBy(desc(orders.orderedAt))
      .limit(12),
    db.select({
      stockItemId: stockItemBalances.stockItemId,
      currentQuantity: stockItemBalances.currentQuantity,
    }).from(stockItemBalances),
    db.select({
      id: productionStockRequests.id,
      stockItemId: productionStockRequests.stockItemId,
      note: productionStockRequests.note,
      status: productionStockRequests.status,
      createdAt: productionStockRequests.createdAt,
      resolvedAt: productionStockRequests.resolvedAt,
    }).from(productionStockRequests)
      .where(eq(productionStockRequests.cardId, cardId))
      .orderBy(desc(productionStockRequests.createdAt))
      .limit(30),
    card.assigneeUserId
      ? db.select({ name: userProfiles.name, email: userProfiles.email }).from(userProfiles).where(eq(userProfiles.userId, card.assigneeUserId)).limit(1)
      : Promise.resolve([]),
  ]);

  const queueOrderIds = queueOrders.map((o) => o.id);
  const queueItems = queueOrderIds.length
    ? await db.select({
        orderId: orderItems.orderId,
        name: orderItems.name,
        quantity: orderItems.quantity,
      }).from(orderItems).where(inArray(orderItems.orderId, queueOrderIds))
    : [];

  const itemsByOrder = new Map<string, { name: string; quantity: number }[]>();
  for (const item of queueItems) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({ name: item.name, quantity: item.quantity });
    itemsByOrder.set(item.orderId, list);
  }

  const toMake = new Map<string, number>();
  for (const item of queueItems) toMake.set(item.name, (toMake.get(item.name) ?? 0) + item.quantity);
  const toMakeTotals = [...toMake.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity);

  const queue = queueOrders.map((order) => ({
    ...order,
    customerLabel: order.organizationName ?? order.recipientName ?? order.contactName ?? "Bez jména",
    items: itemsByOrder.get(order.id) ?? [],
  }));

  const stockByItem = new Map<string, number>();
  for (const row of stockRows) stockByItem.set(row.stockItemId, (stockByItem.get(row.stockItemId) ?? 0) + row.currentQuantity);

  const ingredientRows = await db.select().from(stockItems).where(and(eq(stockItems.kind, "stock_material"), eq(stockItems.isActive, true))).orderBy(asc(stockItems.name));
  const ingredients = ingredientRows.map((item) => ({ ...item, currentQuantity: stockByItem.get(item.id) ?? 0 }));
  const ingredientById = new Map(ingredientRows.map((item) => [item.id, item]));

  const requestViews = requests.map((request) => ({
    ...request,
    stockItemName: request.stockItemId ? ingredientById.get(request.stockItemId)?.name ?? null : null,
  }));

  return {
    card,
    assignee: assignee[0] ?? null,
    access,
    queue,
    toMakeTotals,
    produced: producedOrders.map((order) => ({
      ...order,
      customerLabel: order.organizationName ?? order.recipientName ?? order.contactName ?? "Bez jména",
    })),
    ingredients,
    requests: requestViews,
    openRequestCount: requestViews.filter((r) => r.status === "open").length,
  };
}

export async function addProductionStockRequest(input: unknown) {
  const access = await requireCardAccess(PETR_PRODUCTION_CARD_ID, true);
  const parsed = stockRequestInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };

  if (parsed.data.stockItemId) {
    const [item] = await db.select({ id: stockItems.id }).from(stockItems).where(eq(stockItems.id, parsed.data.stockItemId)).limit(1);
    if (!item) return { ok: false as const, error: "Skladová karta nebyla nalezena." };
  }

  await db.insert(productionStockRequests).values({
    cardId: PETR_PRODUCTION_CARD_ID,
    stockItemId: parsed.data.stockItemId ?? null,
    note: parsed.data.note,
    createdBy: access.userId,
  });
  return { ok: true as const };
}

export async function resolveProductionStockRequest(requestId: unknown) {
  const access = await requireCardAccess(PETR_PRODUCTION_CARD_ID, true);
  if (!access.isAdmin) throw new ForbiddenError();
  if (typeof requestId !== "string" || !requestId) return { ok: false as const, error: "Neplatná žádost." };

  const result = await db.update(productionStockRequests)
    .set({ status: "done", resolvedBy: access.userId, resolvedAt: new Date() })
    .where(and(eq(productionStockRequests.id, requestId), eq(productionStockRequests.cardId, PETR_PRODUCTION_CARD_ID), eq(productionStockRequests.status, "open")))
    .returning({ id: productionStockRequests.id });
  if (result.length === 0) return { ok: false as const, error: "Žádost nebyla nalezena nebo už je vyřízená." };
  return { ok: true as const };
}

export async function assignProductionCardByEmail(input: unknown) {
  const access = await requireCardAccess(PETR_PRODUCTION_CARD_ID, true);
  if (!access.isAdmin) throw new ForbiddenError();
  const parsed = assignmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Zadejte platný e-mail pozvaného účtu." };
  const [profile] = await db.select({ userId: userProfiles.userId, name: userProfiles.name, email: userProfiles.email })
    .from(userProfiles).where(eq(userProfiles.email, parsed.data.email)).limit(1);
  if (!profile) return { ok: false as const, error: "Účet s tímto e-mailem zatím v MojeBegina není. Nejdřív Petra pozvěte a potom kartu přiřaďte." };
  const roles = await db.select({ role: userRoles.systemRole }).from(userRoles).where(and(eq(userRoles.userId, profile.userId), inArray(userRoles.systemRole, ["CUSTOMER", "EMPLOYEE", "EXECUTIVE"])));
  if (roles.length === 0) return { ok: false as const, error: "Účet nemá povolenou roli pro MojeBegina." };
  await db.update(productionCards).set({ assigneeUserId: profile.userId, updatedAt: new Date() }).where(eq(productionCards.id, PETR_PRODUCTION_CARD_ID));
  return { ok: true as const, profile };
}

// Pozvání do appky — stejný vzor jako inviteLucieCollaborator
// (collaboratorCards.ts): Neon Auth účet bez hesla, role EMPLOYEE,
// user_activations + profil atomicky, pak rovnou přiřazení karty.
export async function inviteProductionCollaborator(input: unknown) {
  const access = await requireCardAccess(PETR_PRODUCTION_CARD_ID, true);
  if (!access.isAdmin) throw new ForbiddenError();
  const parsed = inviteCollaboratorInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Zadejte jméno a platný e-mail." };

  const { data: existingUsers, error: lookupError } = await auth.admin.listUsers({
    query: { filterField: "email", filterOperator: "eq", filterValue: parsed.data.email, limit: 1 },
  });
  if (lookupError) return { ok: false as const, error: "Nepodařilo se ověřit e-mail. Zkuste to prosím znovu." };
  const existing = existingUsers?.users?.[0] ?? null;

  let userId: string;
  let created = false;
  if (existing) {
    userId = existing.id;
  } else {
    const { data: createdUser, error: createUserError } = await auth.admin.createUser({
      email: parsed.data.email,
      name: parsed.data.name,
    });
    if (createUserError || !createdUser) {
      return { ok: false as const, error: "Nepodařilo se založit uživatelský účet. Zkuste to prosím znovu." };
    }
    userId = createdUser.user.id;
    created = true;
  }

  try {
    if (created) {
      await db.batch([
        db.insert(userRoles).values({ userId, systemRole: "EMPLOYEE" }),
        db.insert(userActivations).values({ userId }),
        upsertUserProfileStatement(userId, parsed.data.name, parsed.data.email),
        db.update(productionCards).set({ assigneeUserId: userId, updatedAt: new Date() }).where(eq(productionCards.id, PETR_PRODUCTION_CARD_ID)),
      ]);
    } else {
      await db.insert(userRoles).values({ userId, systemRole: "EMPLOYEE" }).onConflictDoNothing();
      await db.insert(userActivations).values({ userId }).onConflictDoNothing();
      await upsertUserProfile(userId, existing?.name ?? parsed.data.name, existing?.email ?? parsed.data.email).catch(() => {});
      await db.update(productionCards).set({ assigneeUserId: userId, updatedAt: new Date() }).where(eq(productionCards.id, PETR_PRODUCTION_CARD_ID));
    }
  } catch {
    if (created) {
      try {
        await auth.admin.removeUser({ userId });
      } catch {
        return {
          ok: false as const,
          error: `Nepodařilo se pozvat do výroby a automatický úklid uživatelského účtu (${parsed.data.email}) selhal — smažte ho prosím ručně v Neon Console.`,
        };
      }
    }
    return { ok: false as const, error: "Nepodařilo se pozvat do výroby. Zkuste to prosím znovu." };
  }

  const invited = await inviteCustomer(userId);
  if (!invited.ok) return { ok: false as const, error: invited.error };

  return { ok: true as const, email: parsed.data.email };
}

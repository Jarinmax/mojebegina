// Security Phase 15 (Objednávky 1.0) — datová vrstva objednávek. Stejný
// princip jako companyNodes.ts: kontrola a dotaz jsou neoddělitelné, každá
// exportovaná funkce si sama volá requireOrderContext(). Gate je z
// orderAuth.ts, ne z adminAuth.ts — viz komentář tam. Rozšiřuje existující
// `orders`/`order_items`/`invoices` (Fáze 2.0), ne paralelní model — viz
// schema.ts komentář u `orders` pro zdůvodnění tří nezávislých rolí kolem
// "kdo objednal".
import "server-only";
import { randomUUID } from "crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, orderActivity, organizations, userRoles } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireOrderAccess } from "./orderAuth";
import { getUserProfile, getUserProfiles } from "./userProfiles";
import {
  validateCreateOrderInput,
  validateFulfillmentStatusInput,
  validatePaymentStatusInput,
  validateNoteInput,
  isPaymentOverdue,
  type CreateOrderInput,
  type FulfillmentStatus,
  type PaymentStatus,
  type NoteInput,
} from "./orderValidation";
import type { AuthContext } from "./types";

export async function requireOrderContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireOrderAccess(ctx);
}

// --- Pickery pro formulář ručního zadání ------------------------------

export type OrganizationOption = { id: string; name: string };

export async function listOrganizationsForOrderPicker(): Promise<OrganizationOption[]> {
  await requireOrderContext();

  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .orderBy(organizations.name);
}

export type InternalStaffOption = { userId: string; name: string | null; email: string };

// MVP: ADMIN/EXECUTIVE/EMPLOYEE jsou kandidáti na "odpovědná osoba" — širší
// množina než requireOrderAccess (jen ADMIN/EXECUTIVE smí objednávky číst
// a upravovat), protože odpovědným řešitelem může být i EMPLOYEE, i když
// dnes ještě žádný účet tuhle roli nemá (viz companyNodeAuth.ts komentář
// o stejném MVP omezení).
export async function listInternalStaff(): Promise<InternalStaffOption[]> {
  await requireOrderContext();

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
    .filter((v): v is InternalStaffOption => v !== null)
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

// --- Seznam / souhrnné dlaždice ----------------------------------------

export type OrderCardData = {
  id: string;
  buyerOrganizationId: string;
  buyerOrganizationName: string;
  contactName: string | null;
  itemsSummary: string;
  totalKc: number;
  orderedAt: Date;
  plannedDeliveryAt: Date | null;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  paymentOverdue: boolean;
  responsibleUserId: string | null;
  responsibleName: string | null;
};

export type OrderCounts = {
  new: number;
  inProcess: number;
  readyForDelivery: number;
  awaitingPayment: number;
};

export type OrderList = { orders: OrderCardData[]; counts: OrderCounts };

async function buildOrderCards(
  orderRows: (typeof orders.$inferSelect)[]
): Promise<OrderCardData[]> {
  if (orderRows.length === 0) {
    return [];
  }

  const orgIds = [...new Set(orderRows.map((o) => o.buyerOrganizationId))];
  const orgRows = orgIds.length
    ? await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, orgIds))
    : [];
  const orgNameById = new Map(orgRows.map((o) => [o.id, o.name]));

  const responsibleIds = [
    ...new Set(orderRows.map((o) => o.responsibleUserId).filter((v): v is string => v !== null)),
  ];
  const responsibleProfiles = await getUserProfiles(responsibleIds);

  const orderIds = orderRows.map((o) => o.id);
  const itemRows = orderIds.length
    ? await db
        .select({ orderId: orderItems.orderId, name: orderItems.name, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
    : [];
  const itemsByOrder = new Map<string, string[]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(`${item.quantity}× ${item.name}`);
    itemsByOrder.set(item.orderId, list);
  }

  return orderRows.map((o) => {
    const responsible = o.responsibleUserId ? responsibleProfiles.get(o.responsibleUserId) : null;
    return {
      id: o.id,
      buyerOrganizationId: o.buyerOrganizationId,
      buyerOrganizationName: orgNameById.get(o.buyerOrganizationId) ?? "Neznámá organizace",
      contactName: o.contactName,
      itemsSummary: (itemsByOrder.get(o.id) ?? []).join(", "),
      totalKc: o.totalKc,
      orderedAt: o.orderedAt,
      plannedDeliveryAt: o.plannedDeliveryAt,
      fulfillmentStatus: o.fulfillmentStatus as FulfillmentStatus,
      paymentStatus: o.paymentStatus as PaymentStatus,
      // MVP: bez napojené faktury (invoices.dueAt) nemá "po splatnosti" z
      // čeho se spočítat — invoices je zatím jen budoucí eDoklad hák (viz
      // schema.ts), objednávky ho v 1.0 nezakládají. isPaymentOverdue tu
      // zůstává jediné volané místo, aby šlo doplnit beze změny volajících.
      paymentOverdue: isPaymentOverdue(o.paymentStatus as PaymentStatus, null),
      responsibleUserId: o.responsibleUserId,
      responsibleName: responsible?.name ?? responsible?.email ?? null,
    };
  });
}

export async function listOrders(): Promise<OrderList> {
  await requireOrderContext();

  const rows = await db.select().from(orders).orderBy(desc(orders.orderedAt));
  const cards = await buildOrderCards(rows);

  const counts: OrderCounts = { new: 0, inProcess: 0, readyForDelivery: 0, awaitingPayment: 0 };
  for (const card of cards) {
    if (card.fulfillmentStatus === "new") counts.new += 1;
    if (card.fulfillmentStatus === "confirmed" || card.fulfillmentStatus === "preparing") {
      counts.inProcess += 1;
    }
    if (card.fulfillmentStatus === "ready" || card.fulfillmentStatus === "out_for_delivery") {
      counts.readyForDelivery += 1;
    }
    if (card.paymentStatus === "unpaid" || card.paymentStatus === "invoiced") {
      counts.awaitingPayment += 1;
    }
  }

  return { orders: cards, counts };
}

// --- Detail --------------------------------------------------------------

export type OrderItemData = { name: string; quantity: number; unitPriceKc: number; lineTotalKc: number };

export type OrderActivityEntry = {
  id: string;
  kind: string;
  authorUserId: string;
  authorName: string | null;
  body: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type OrderDetail = {
  order: OrderCardData & {
    subtotalKc: number;
    shippingKc: number;
    contactPhone: string | null;
    contactEmail: string | null;
    enteredByUserId: string | null;
    enteredByName: string | null;
    note: string | null;
  };
  items: OrderItemData[];
  activity: OrderActivityEntry[];
};

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  await requireOrderContext();

  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) {
    return null;
  }

  const [card] = await buildOrderCards([row]);

  const enteredBy = row.enteredByUserId ? await getUserProfile(row.enteredByUserId) : null;

  const items = await db
    .select({
      name: orderItems.name,
      quantity: orderItems.quantity,
      unitPriceKc: orderItems.unitPriceKc,
      lineTotalKc: orderItems.lineTotalKc,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const activityRows = await db
    .select()
    .from(orderActivity)
    .where(eq(orderActivity.orderId, orderId));
  activityRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    order: {
      ...card,
      subtotalKc: row.subtotalKc,
      shippingKc: row.shippingKc,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail,
      enteredByUserId: row.enteredByUserId,
      enteredByName: enteredBy?.name ?? enteredBy?.email ?? null,
      note: row.note,
    },
    items,
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

// --- Zápisy ----------------------------------------------------------

export type OrderResult = { ok: true } | { ok: false; error: string };
export type CreateOrderResult = { ok: true; id: string } | { ok: false; error: string };

export async function createOrder(rawInput: CreateOrderInput): Promise<CreateOrderResult> {
  const ctx = await requireOrderContext();

  const validated = validateCreateOrderInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const value = validated.value;

  const [buyer] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, value.buyerOrganizationId))
    .limit(1);
  if (!buyer) {
    return { ok: false, error: "Zákaznická organizace nebyla nalezena." };
  }

  const id = randomUUID();
  await db.batch([
    db.insert(orders).values({
      id,
      buyerOrganizationId: value.buyerOrganizationId,
      contactName: value.contactName,
      contactPhone: value.contactPhone,
      contactEmail: value.contactEmail,
      enteredByUserId: ctx.userId,
      subtotalKc: value.subtotalKc,
      shippingKc: value.shippingKc,
      totalKc: value.totalKc,
      paymentStatus: "unpaid",
      fulfillmentStatus: "new",
      plannedDeliveryAt: value.plannedDeliveryAt,
      note: value.note,
    }),
    db.insert(orderItems).values(
      value.items.map((item) => ({
        orderId: id,
        name: item.name,
        quantity: item.quantity,
        unitPriceKc: item.unitPriceKc,
        lineTotalKc: item.lineTotalKc,
      }))
    ),
    db.insert(orderActivity).values({
      orderId: id,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "created",
    }),
  ]);

  return { ok: true, id };
}

export async function updateFulfillmentStatus(
  orderId: string,
  rawStatus: string
): Promise<OrderResult> {
  const ctx = await requireOrderContext();

  const validated = validateFulfillmentStatusInput(rawStatus);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [current] = await db
    .select({ fulfillmentStatus: orders.fulfillmentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }

  await db.batch([
    db
      .update(orders)
      .set({ fulfillmentStatus: validated.value })
      .where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "fulfillment_status_changed",
      metadata: { from: current.fulfillmentStatus, to: validated.value },
    }),
  ]);

  return { ok: true };
}

export async function updatePaymentStatus(orderId: string, rawStatus: string): Promise<OrderResult> {
  const ctx = await requireOrderContext();

  const validated = validatePaymentStatusInput(rawStatus);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [current] = await db
    .select({ paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!current) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }

  await db.batch([
    db
      .update(orders)
      .set({
        paymentStatus: validated.value,
        paidAt: validated.value === "paid" ? new Date() : null,
      })
      .where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "payment_status_changed",
      metadata: { from: current.paymentStatus, to: validated.value },
    }),
  ]);

  return { ok: true };
}

export async function assignResponsible(orderId: string, responsibleUserId: string): Promise<OrderResult> {
  const ctx = await requireOrderContext();

  const responsible = await getUserProfile(responsibleUserId);
  if (!responsible) {
    return { ok: false, error: "Uživatele se nepodařilo najít." };
  }

  const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }

  await db.batch([
    db.update(orders).set({ responsibleUserId }).where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "responsible_assigned",
      metadata: { responsibleUserId, responsibleName: responsible.name ?? responsible.email },
    }),
  ]);

  return { ok: true };
}

export async function unassignResponsible(orderId: string): Promise<OrderResult> {
  const ctx = await requireOrderContext();

  const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }

  await db.batch([
    db.update(orders).set({ responsibleUserId: null }).where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "responsible_assigned",
      metadata: { responsibleUserId: null },
    }),
  ]);

  return { ok: true };
}

export async function updateOrderNote(orderId: string, rawInput: NoteInput): Promise<OrderResult> {
  const ctx = await requireOrderContext();

  const validated = validateNoteInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return { ok: false, error: "Objednávka nebyla nalezena." };
  }

  await db.batch([
    db
      .update(orders)
      .set({ note: validated.value || null })
      .where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "note_added",
      body: validated.value || null,
    }),
  ]);

  return { ok: true };
}

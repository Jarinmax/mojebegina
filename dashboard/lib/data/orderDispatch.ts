import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderActivity, orders } from "@/lib/db/schema";
import { requireOrderContext } from "./orders";

// „Odesláno“ a „Faktura poslána“ (Lucie 18. 11. 2026) — ruční zaškrtnutí
// nezávislá na stavu vyřízení i platby. Obojí jde vrátit zpět; každé
// zaškrtnutí i vrácení se zapíše do historie objednávky.

export type DispatchResult = { ok: true } | { ok: false; error: string };

const TRACKING_MAX = 80;

async function orderExists(orderId: string) {
  const [row] = await db
    .select({ id: orders.id, shippedAt: orders.shippedAt, invoiceSentAt: orders.invoiceSentAt })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return row ?? null;
}

export async function markOrderShipped(orderId: string, rawTracking: string): Promise<DispatchResult> {
  const ctx = await requireOrderContext();
  const tracking = rawTracking.trim().slice(0, TRACKING_MAX);
  const order = await orderExists(orderId);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  if (order.shippedAt) return { ok: true };
  const name = ctx.name ?? ctx.email;
  await db.batch([
    db
      .update(orders)
      .set({
        shippedAt: new Date(),
        shippedByUserId: ctx.userId,
        shippedByName: name,
        ...(tracking ? { trackingNumber: tracking } : {}),
      })
      .where(and(eq(orders.id, orderId), isNull(orders.shippedAt))),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "shipped_marked",
      metadata: tracking ? { trackingNumber: tracking } : {},
    }),
  ]);
  return { ok: true };
}

export async function unmarkOrderShipped(orderId: string): Promise<DispatchResult> {
  const ctx = await requireOrderContext();
  const order = await orderExists(orderId);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  if (!order.shippedAt) return { ok: true };
  await db.batch([
    db
      .update(orders)
      .set({ shippedAt: null, shippedByUserId: null, shippedByName: null })
      .where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "shipped_unmarked",
      metadata: { previousShippedAt: order.shippedAt.toISOString() },
    }),
  ]);
  return { ok: true };
}

export async function markOrderInvoiceSent(orderId: string): Promise<DispatchResult> {
  const ctx = await requireOrderContext();
  const order = await orderExists(orderId);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  if (order.invoiceSentAt) return { ok: true };
  await db.batch([
    db
      .update(orders)
      .set({
        invoiceSentAt: new Date(),
        invoiceSentByUserId: ctx.userId,
        invoiceSentByName: ctx.name ?? ctx.email,
        invoiceSentTo: null,
        invoiceSentMethod: "manual",
      })
      .where(and(eq(orders.id, orderId), isNull(orders.invoiceSentAt))),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "invoice_sent_marked",
      metadata: { method: "manual" },
    }),
  ]);
  return { ok: true };
}

export async function unmarkOrderInvoiceSent(orderId: string): Promise<DispatchResult> {
  const ctx = await requireOrderContext();
  const order = await orderExists(orderId);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  if (!order.invoiceSentAt) return { ok: true };
  await db.batch([
    db
      .update(orders)
      .set({
        invoiceSentAt: null,
        invoiceSentByUserId: null,
        invoiceSentByName: null,
        invoiceSentTo: null,
        invoiceSentMethod: null,
      })
      .where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "invoice_sent_unmarked",
      metadata: { previousInvoiceSentAt: order.invoiceSentAt.toISOString() },
    }),
  ]);
  return { ok: true };
}

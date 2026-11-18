import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderActivity, orders } from "@/lib/db/schema";
import { DISPATCHED_STATUSES } from "@/lib/eshop/invoicing/afterPaid";
import { requireOrderContext, updateFulfillmentStatus } from "./orders";

// „Odesláno“ a „Faktura poslána“ (Lucie 18. 11. 2026). Odesláno je svázané
// se stavem „Předáno přepravci“ (jedno klepnutí, faktura odejde sama);
// Faktura poslána jde zaškrtnout i ručně. Obojí jde vrátit zpět; každé
// zaškrtnutí i vrácení se zapíše do historie objednávky.

export type DispatchResult = { ok: true } | { ok: false; error: string };

const TRACKING_MAX = 80;

async function orderExists(orderId: string) {
  const [row] = await db
    .select({ id: orders.id, shippedAt: orders.shippedAt, invoiceSentAt: orders.invoiceSentAt, fulfillmentStatus: orders.fulfillmentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return row ?? null;
}

/** "RRRR-MM-DD" z formuláře → poledne toho dne (zobrazuje se jen datum). */
export function parseShippedDate(raw: string, now: Date = new Date()): Date | { error: string } | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: "Datum odeslání není platné." };
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return { error: "Datum odeslání není platné." };
  if (date.getTime() > now.getTime() + 36 * 3_600_000) return { error: "Datum odeslání nemůže být v budoucnu." };
  if (date.getTime() < now.getTime() - 120 * 86_400_000) return { error: "Datum odeslání je víc než 4 měsíce zpátky — zkontrolujte ho." };
  return date;
}

/**
 * „Odesláno“ (Lucie 18. 11. 2026): jedno klepnutí = objednávka je odeslaná.
 * Stav se sám přepne na „Předáno přepravci“ → zákazníkovi odejde faktura
 * (sendInvoiceOnDispatch, jen zaplacená e-shopová objednávka, nejvýš jednou)
 * a zaškrtne se „Faktura poslána“. Datum jde zadat zpětně (odesláno včera).
 */
export async function markOrderShipped(orderId: string, rawTracking: string, rawDate = ""): Promise<DispatchResult> {
  const ctx = await requireOrderContext();
  const tracking = rawTracking.trim().slice(0, TRACKING_MAX);
  const parsed = parseShippedDate(rawDate);
  if (parsed && "error" in parsed) return { ok: false, error: parsed.error };
  const order = await orderExists(orderId);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  if (order.fulfillmentStatus === "cancelled") return { ok: false, error: "Objednávka je stornovaná — nejde ji odeslat." };
  if (!order.shippedAt) {
    await db.batch([
      db
        .update(orders)
        .set({
          shippedAt: parsed ?? new Date(),
          shippedByUserId: ctx.userId,
          shippedByName: ctx.name ?? ctx.email,
          ...(tracking ? { trackingNumber: tracking } : {}),
        })
        .where(and(eq(orders.id, orderId), isNull(orders.shippedAt))),
      db.insert(orderActivity).values({
        orderId,
        authorUserId: ctx.userId,
        authorName: ctx.name,
        kind: "shipped_marked",
        metadata: { ...(tracking ? { trackingNumber: tracking } : {}), ...(parsed ? { shippedOn: rawDate.trim() } : {}) },
      }),
    ]);
  }
  if (!(DISPATCHED_STATUSES as readonly string[]).includes(order.fulfillmentStatus)) {
    const changed = await updateFulfillmentStatus(orderId, "handed_to_carrier", order.fulfillmentStatus);
    if (!changed.ok) return { ok: false, error: changed.error };
  }
  return { ok: true };
}

/** Oprava data odeslání (zaškrtnuto až druhý den). */
export async function changeShippedDate(orderId: string, rawDate: string): Promise<DispatchResult> {
  const ctx = await requireOrderContext();
  const parsed = parseShippedDate(rawDate);
  if (!parsed) return { ok: false, error: "Vyberte datum odeslání." };
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const order = await orderExists(orderId);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  if (!order.shippedAt) return { ok: false, error: "Objednávka ještě není označená jako odeslaná." };
  await db.batch([
    db.update(orders).set({ shippedAt: parsed }).where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({
      orderId,
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "shipped_date_changed",
      metadata: { from: order.shippedAt.toISOString(), shippedOn: rawDate.trim() },
    }),
  ]);
  return { ok: true };
}

/** Vrátit zpět: zruší „Odesláno“ a stav vrátí na „Připravená“. Odeslaná faktura zůstává. */
export async function unmarkOrderShipped(orderId: string): Promise<DispatchResult> {
  const ctx = await requireOrderContext();
  const order = await orderExists(orderId);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  if (order.shippedAt) {
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
  }
  if ((DISPATCHED_STATUSES as readonly string[]).includes(order.fulfillmentStatus)) {
    const changed = await updateFulfillmentStatus(orderId, "ready", order.fulfillmentStatus);
    if (!changed.ok) return { ok: false, error: changed.error };
  }
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

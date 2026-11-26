import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderActivity, orders } from "@/lib/db/schema";
import { requireOrderContext, updatePaymentStatus } from "./orders";
import { markOrderShipped, type DispatchResult } from "./orderDispatch";

// Předání objednávky z výrobní karty (Lucie 26. 11. 2026): jak se předalo
// (přepravci / osobně) a u nezaplacené ruční objednávky jak se platí —
// aby se faktura vystavila a poslala správně (uhrazená, nebo s QR).

export type HandoverMode = "carrier" | "personal";
export type HandoverPayment = "cash" | "card" | "prepaid" | "invoice";

export const HANDOVER_PAYMENT_LABEL: Record<HandoverPayment, string> = {
  cash: "hotově",
  card: "kartou",
  prepaid: "převodem (zaplaceno předem)",
  invoice: "převodem na fakturu",
};

export function parseHandover(mode: string, payment: string): { mode: HandoverMode; payment: HandoverPayment | null } | { error: string } {
  if (mode !== "carrier" && mode !== "personal") return { error: "Vyberte, jak jste objednávku předali." };
  if (!payment) return { mode, payment: null };
  if (!(payment in HANDOVER_PAYMENT_LABEL)) return { error: "Vyberte, jak zákazník platí." };
  return { mode, payment: payment as HandoverPayment };
}

/** Zapíše platbu (u nezaplacené ruční objednávky) a pak odeslání. Pořadí je důležité: faktura vznikne už se správnou úhradou. */
export async function completeHandover(
  orderId: string,
  mode: HandoverMode,
  payment: HandoverPayment | null,
  rawDate: string
): Promise<DispatchResult> {
  const ctx = await requireOrderContext();
  const [order] = await db
    .select({ channel: orders.channel, paymentStatus: orders.paymentStatus, label: orders.paymentMethodLabel })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };

  const needsPayment = order.channel === "manual" && order.paymentStatus !== "paid";
  if (needsPayment && !payment) return { ok: false, error: "Vyberte, jak zákazník platí." };
  if (needsPayment && payment) {
    const label = HANDOVER_PAYMENT_LABEL[payment];
    if (order.label !== label) {
      await db.batch([
        db.update(orders).set({ paymentMethodLabel: label }).where(eq(orders.id, orderId)),
        db.insert(orderActivity).values({
          orderId,
          authorUserId: ctx.userId,
          authorName: ctx.name,
          kind: "note_added",
          body: `Způsob platby při předání: ${label}${order.label ? ` (dřív: ${order.label})` : ""}`,
        }),
      ]);
    }
    if (payment !== "invoice") {
      const paid = await updatePaymentStatus(orderId, "paid", order.paymentStatus);
      if (!paid.ok) return { ok: false, error: paid.error };
    }
  }

  return markOrderShipped(orderId, "", rawDate, mode === "personal" ? "delivered" : "handed_to_carrier");
}

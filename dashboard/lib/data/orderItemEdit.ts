// Úprava počtu kusů v ruční objednávce (Jarin 27. 11. 2026 — Kašpárek 4 → 3
// dýňové bez SQL). Jen ruční objednávky, které ještě neodjely a nejsou
// stornované. 0 kusů = položku odebrat (poslední položku odebrat nejde).
// Vystavenou fakturu to NEmění — upozorní, že ji je potřeba opravit.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderActivity, orderItems, orders } from "@/lib/db/schema";
import { requireOrderContext } from "./orders";
import { parseQuantity } from "./orderItemEditValidation";

export type OrderItemEditResult = { ok: true; totalKc: number; invoiceNumber: string | null } | { ok: false; error: string };

export async function setOrderItemQuantity(orderId: string, itemId: string, rawQuantity: unknown): Promise<OrderItemEditResult> {
  const ctx = await requireOrderContext();
  const quantity = parseQuantity(rawQuantity);
  if (quantity === null) return { ok: false, error: "Zadejte počet kusů (celé číslo 0–999)." };
  const [order] = await db
    .select({ channel: orders.channel, status: orders.fulfillmentStatus, shippedAt: orders.shippedAt, shippingKc: orders.shippingKc })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  if (order.channel !== "manual") return { ok: false, error: "Počet kusů jde měnit jen u ručních objednávek (e-shopovou objednávku zákazník zaplatil v této podobě)." };
  if (order.status === "cancelled") return { ok: false, error: "Objednávka je stornovaná." };
  if (order.shippedAt || ["handed_to_carrier", "out_for_delivery", "delivered"].includes(order.status)) {
    return { ok: false, error: "Objednávka už odjela — počet kusů už nejde změnit." };
  }
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const item = items.find((i) => i.id === itemId);
  if (!item) return { ok: false, error: "Položka nebyla nalezena." };
  if (item.quantity === quantity) return { ok: true, totalKc: items.reduce((s, i) => s + i.lineTotalKc, 0) + order.shippingKc, invoiceNumber: null };
  if (quantity === 0 && items.length === 1) return { ok: false, error: "Poslední položku nejde odebrat — objednávku raději stornujte." };

  const subtotal = items.reduce((s, i) => s + (i.id === itemId ? i.unitPriceKc * quantity : i.lineTotalKc), 0);
  const total = subtotal + order.shippingKc;
  const body =
    quantity === 0
      ? `Odebrána položka: ${item.quantity}× ${item.name}. Celkem nově ${total} Kč.`
      : `Změna počtu: ${item.name} ${item.quantity} → ${quantity} ks. Celkem nově ${total} Kč.`;
  await db.batch([
    quantity === 0
      ? db.delete(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
      : db
          .update(orderItems)
          .set({ quantity, lineTotalKc: item.unitPriceKc * quantity })
          .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId))),
    db.update(orders).set({ subtotalKc: subtotal, totalKc: total }).where(eq(orders.id, orderId)),
    db.insert(orderActivity).values({ orderId, authorUserId: ctx.userId, authorName: ctx.name, kind: "note_added", body }),
  ]);

  // Vystavená faktura (vlastní 2026xxxx) — k objednávce nebo s jejím číslem.
  const inv = (await db.execute(sql`
    SELECT d.number FROM own_invoice_documents d JOIN orders o ON o.id = ${orderId}
    WHERE d.state <> 'cancelled' AND d.kind = 'invoice'
      AND (d.order_id = ${orderId} OR d.snapshot->>'orderReference' = o.order_number::text)
    LIMIT 1`)).rows[0] as { number: string } | undefined;
  return { ok: true, totalKc: total, invoiceNumber: inv?.number ?? null };
}

// Storno objednávky (zadání majitele 8. 10. 2026) — co se stane po
// SKUTEČNÉ změně stavu na „Stornovaná“ (lib/data/orders.ts →
// updateFulfillmentStatus, jen když podmíněný UPDATE opravdu proběhl):
//
//   1. přijaté peníze (e-shop: čistý zůstatek plateb; ostatní: ručně
//      „Zaplaceno“) → záznam „refund_required“: objednávka je označená
//      k SAMOSTATNÉMU vyřešení vrácení peněz. Nic se nevrací automaticky
//      a zákazníkovi se automatické vrácení neslibuje.
//   2. e-shop → zákazníkovi „Objednávka … byla zrušena“ (nejvýš jednou na
//      objednávku: email_sent v historii + Idempotency-Key Resendu, viz
//      lib/eshop/email/orderEmails.ts).
//
// Platba, která dorazí až po stornu (webhook Stripe), objednávku také
// označí k vrácení — faktura ani „Platbu jsme přijali“ pak neodejdou
// (lib/eshop/invoicing/afterPaid.ts).
//
// Označení zmizí, až někdo v MojeBegina potvrdí „Vrácení peněz vyřešeno“
// (refund_resolved), nebo když se objednávka ze storna vrátí.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { orderActivity, orderPaymentBalance, orders } from "@/lib/db/schema";
import { sendOrderEmails, type OrderEmailOutcome, type SendOrderEmailsOptions } from "./email/orderEmails";
import type { InvoiceActor } from "./invoicing/service";

type Db = NeonHttpDatabase<typeof schema>;

export const CANCELLED = "cancelled";
export const REFUND_REQUIRED = "refund_required";
export const REFUND_RESOLVED = "refund_resolved";

/** Kolik peněz za objednávku Begina drží (haléře) — 0 = není co vracet. */
export async function heldAmountHal(db: Db, orderId: string): Promise<number> {
  const [order] = await db
    .select({ channel: orders.channel, paymentStatus: orders.paymentStatus, totalKc: orders.totalKc })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return 0;
  if (order.channel === "eshop") {
    const [balance] = await db
      .select({ netHal: orderPaymentBalance.netHal })
      .from(orderPaymentBalance)
      .where(eq(orderPaymentBalance.orderId, orderId))
      .limit(1);
    return Math.max(0, Number(balance?.netHal ?? 0));
  }
  // ruční objednávky (B2B): platby se neevidují, jen stav „Zaplaceno“
  return order.paymentStatus === "paid" ? order.totalKc * 100 : 0;
}

/** Objednávky, které čekají na vyřešení vrácení peněz (poslední záznam je refund_required). */
export async function openRefunds(db: Db, orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const rows = await db
    .select({ orderId: orderActivity.orderId, kind: orderActivity.kind })
    .from(orderActivity)
    .where(and(inArray(orderActivity.orderId, orderIds), inArray(orderActivity.kind, [REFUND_REQUIRED, REFUND_RESOLVED])))
    .orderBy(desc(orderActivity.createdAt));
  const latest = new Map<string, string>();
  for (const row of rows) if (!latest.has(row.orderId)) latest.set(row.orderId, row.kind);
  return new Set([...latest].filter(([, kind]) => kind === REFUND_REQUIRED).map(([id]) => id));
}

function actorValues(actor: InvoiceActor) {
  return actor.type === "user"
    ? { actorType: "user", authorUserId: actor.userId, authorName: actor.name }
    : { actorType: "system", authorUserId: null, authorName: actor.name };
}

/**
 * Označí objednávku k vrácení peněz (jen když drží peníze a označení už
 * není otevřené). Vrací držené haléře (0 = nic se neoznačilo).
 */
export async function markRefundRequired(
  db: Db,
  orderId: string,
  actor: InvoiceActor,
  reason: "cancelled" | "paid_after_cancellation"
): Promise<number> {
  const amountHal = await heldAmountHal(db, orderId);
  if (amountHal <= 0) return 0;
  if ((await openRefunds(db, [orderId])).has(orderId)) return amountHal;
  await db.insert(orderActivity).values({
    orderId,
    ...actorValues(actor),
    kind: REFUND_REQUIRED,
    metadata: { amountHal, reason },
  });
  return amountHal;
}

export type CancellationOutcome = {
  /** držené peníze k vrácení (haléře); 0 = nezaplaceno */
  refundHal: number;
  /** e-mail zákazníkovi (null = objednávka není z e-shopu nebo e-maily vypnuté) */
  email: OrderEmailOutcome | null;
};

/** Po skutečném přepnutí na „Stornovaná“. Nikdy nevyhazuje výjimku — storno je už uložené. */
export async function afterOrderCancelled(
  db: Db,
  orderId: string,
  actor: InvoiceActor,
  baseUrl: string,
  email: SendOrderEmailsOptions = {}
): Promise<CancellationOutcome> {
  let refundHal = 0;
  try {
    refundHal = await markRefundRequired(db, orderId, actor, "cancelled");
  } catch (error) {
    console.error("Storno: označení k vrácení peněz selhalo", orderId, error);
  }
  const outcomes = await sendOrderEmails(db, orderId, "order_cancelled", baseUrl, { ...email, cancellation: { refundHal } });
  return { refundHal, email: outcomes.find((o) => o.template === "customer_cancellation") ?? null };
}

/** Je objednávka stornovaná? (pojistka pro platby a faktury) */
export async function isOrderCancelled(db: Db, orderId: string): Promise<boolean> {
  const [order] = await db
    .select({ status: orders.fulfillmentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return order?.status === CANCELLED;
}

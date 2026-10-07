// ESHOP 1.0 — zahájení platby kartou (Stripe Checkout). Objednávka už je
// uložená jako nezaplacená; tady se k ní vytvoří platební stránka Stripe.
//
// Spojení platby s objednávkou: client_reference_id + metadata.orderId
// (i na PaymentIntentu) = id objednávky, metadata.source odliší naše platby
// od plateb WooCommerce na stejném Stripe účtu.
//
// Opakované kliknutí / „Zaplatit znovu“: pokud poslední platební stránka
// objednávky je ještě otevřená, použije se znovu; souběžné požadavky mají
// stejný idempotency key, takže Stripe vrátí tutéž stránku.
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { orderActivity, orderItems, orders } from "@/lib/db/schema";
import { recordStripeAttempt } from "../payments";

type Db = NeonHttpDatabase<typeof schema>;

export const STRIPE_SOURCE = "mojebegina-eshop";
export const CARD_PAYMENT_METHOD = "karta";
export const PAYMENT_STARTED = "payment_started";

export type CheckoutSessionsApi = {
  create(
    params: Stripe.Checkout.SessionCreateParams,
    options?: { idempotencyKey?: string }
  ): Promise<{ id: string; url: string | null }>;
  retrieve(id: string): Promise<{ id: string; url: string | null; status: string | null }>;
};

export type PaymentOrder = {
  id: string;
  orderNumber: number | null;
  paymentVs: string | null;
  orderedAt: Date;
  channel: string;
  paymentMethodCode: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  contactEmail: string | null;
  subtotalKc: number;
  discountKc: number;
  shippingKc: number;
  totalKc: number;
  shippingMethodLabel: string | null;
  items: { name: string; quantity: number; unitPriceKc: number }[];
};

export function canPayByCard(order: PaymentOrder): { ok: true } | { ok: false; error: string } {
  if (order.channel !== "eshop" || order.paymentMethodCode !== CARD_PAYMENT_METHOD) {
    return { ok: false, error: "Tuto objednávku nelze zaplatit kartou online." };
  }
  if (order.paymentStatus === "paid") {
    return { ok: false, error: "Objednávka už je zaplacená." };
  }
  if (order.fulfillmentStatus === "cancelled") {
    return { ok: false, error: "Objednávka byla zrušena." };
  }
  return { ok: true };
}

/** Parametry platební stránky — položky, doprava, částka v haléřích (CZK má ve Stripe 2 desetinná místa). */
export function buildCheckoutSessionParams(order: PaymentOrder, baseUrl: string): Stripe.Checkout.SessionCreateParams {
  const lines: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map((item) => ({
    quantity: item.quantity,
    price_data: { currency: "czk", unit_amount: item.unitPriceKc * 100, product_data: { name: item.name } },
  }));
  if (order.shippingKc > 0) {
    lines.push({
      quantity: 1,
      price_data: {
        currency: "czk",
        unit_amount: order.shippingKc * 100,
        product_data: { name: order.shippingMethodLabel ?? "Doprava" },
      },
    });
  }
  const linesTotal = lines.reduce((sum, l) => sum + (l.price_data?.unit_amount ?? 0) * (l.quantity ?? 1), 0);
  // Pojistka (např. budoucí sleva): když se položky nesečtou na celkovou
  // částku, zaplatí se jedna položka „Objednávka“ přesně na total.
  const lineItems =
    linesTotal === order.totalKc * 100
      ? lines
      : [
          {
            quantity: 1,
            price_data: {
              currency: "czk",
              unit_amount: order.totalKc * 100,
              product_data: { name: `Objednávka Begina ${order.orderNumber ?? order.id.slice(0, 8)}` },
            },
          },
        ];

  const metadata = { orderId: order.id, source: STRIPE_SOURCE };
  const statusUrl = `${baseUrl}/eshop/objednavka/${order.id}`;
  return {
    mode: "payment",
    locale: "cs",
    line_items: lineItems,
    client_reference_id: order.id,
    metadata,
    payment_intent_data: { metadata },
    customer_email: order.contactEmail ?? undefined,
    success_url: `${statusUrl}?platba=ok`,
    cancel_url: `${statusUrl}?platba=zrusena`,
  };
}

export async function loadPaymentOrder(db: Db, orderId: string): Promise<PaymentOrder | null> {
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      paymentVs: orders.paymentVs,
      orderedAt: orders.orderedAt,
      channel: orders.channel,
      paymentMethodCode: orders.paymentMethodCode,
      paymentStatus: orders.paymentStatus,
      fulfillmentStatus: orders.fulfillmentStatus,
      contactEmail: orders.contactEmail,
      subtotalKc: orders.subtotalKc,
      discountKc: orders.discountKc,
      shippingKc: orders.shippingKc,
      totalKc: orders.totalKc,
      shippingMethodLabel: orders.shippingMethodLabel,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return null;
  const items = await db
    .select({ name: orderItems.name, quantity: orderItems.quantity, unitPriceKc: orderItems.unitPriceKc })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.name));
  return { ...order, items };
}

export type StartPaymentResult = { ok: true; url: string; reused: boolean } | { ok: false; error: string };

export async function startCardPayment(
  db: Db,
  sessions: CheckoutSessionsApi,
  orderId: string,
  baseUrl: string
): Promise<StartPaymentResult> {
  const order = await loadPaymentOrder(db, orderId);
  if (!order) return { ok: false, error: "Objednávka nebyla nalezena." };
  const allowed = canPayByCard(order);
  if (!allowed.ok) return allowed;

  const attempts = await db
    .select({ metadata: orderActivity.metadata })
    .from(orderActivity)
    .where(and(eq(orderActivity.orderId, orderId), eq(orderActivity.kind, PAYMENT_STARTED)))
    .orderBy(desc(orderActivity.createdAt));

  const lastSessionId = (attempts[0]?.metadata as { checkoutSession?: string } | null)?.checkoutSession;
  if (lastSessionId) {
    const last = await sessions.retrieve(lastSessionId);
    if (last.status === "open" && last.url) {
      return { ok: true, url: last.url, reused: true };
    }
  }

  const session = await sessions.create(buildCheckoutSessionParams(order, baseUrl), {
    idempotencyKey: `eshop-order-${orderId}-attempt-${attempts.length + 1}`,
  });
  if (!session.url) return { ok: false, error: "Platební bránu se nepodařilo otevřít." };

  // Souběžný dvojklik dostane od Stripe tutéž stránku — záznam jen jednou
  // (pokus v payments i v historii).
  await recordStripeAttempt(db, {
    orderId,
    checkoutSessionId: session.id,
    amountHal: order.totalKc * 100,
    vs: order.paymentVs,
  });
  const metadata = JSON.stringify({ provider: "stripe", checkoutSession: session.id, attempt: attempts.length + 1 });
  await db.execute(sql`
    INSERT INTO order_activity (order_id, actor_type, author_name, kind, metadata)
    SELECT ${orderId}, 'system', 'E-shop', ${PAYMENT_STARTED}, ${metadata}::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM order_activity
      WHERE order_id = ${orderId} AND kind = ${PAYMENT_STARTED} AND metadata->>'checkoutSession' = ${session.id}
    )`);
  return { ok: true, url: session.url, reused: false };
}

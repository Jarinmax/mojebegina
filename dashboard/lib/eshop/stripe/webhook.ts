// ESHOP 1.0 — zpracování událostí ze Stripe (volá se až PO ověření podpisu
// v app/api/eshop/stripe/webhook/route.ts).
//
// Idempotence: Stripe smí stejnou událost poslat víckrát (a platby
// WooCommerce na stejném účtu chodí sem taky). Každý pokus (Checkout
// Session) je jeden řádek v payments (UNIQUE source + external_id);
// úspěšná platba ho přepne na „proběhlo“ a v téže transakci se přepočítá
// objednávka (lib/eshop/payments.ts) — Zaplaceno až po úhradě celé částky,
// opakovaná nebo souběžná událost nic nezmění a nezapíše druhý záznam.
import { sql } from "drizzle-orm";
import type Stripe from "stripe";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { STRIPE_SOURCE } from "./payment";
import { closeStripeAttempt, recordStripeSuccess } from "../payments";

type Db = NeonHttpDatabase<typeof schema>;

export type WebhookOutcome =
  | "paid"
  | "already-paid"
  | "second-payment"
  | "amount-mismatch"
  | "not-paid-yet"
  | "no-change"
  | "ignored-foreign"
  | "ignored-unknown-order"
  | "ignored-event";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionLike = Pick<
  Stripe.Checkout.Session,
  "id" | "client_reference_id" | "metadata" | "payment_status" | "amount_total" | "currency" | "payment_intent"
>;

function paymentIntentId(session: SessionLike): string | null {
  const pi = session.payment_intent;
  return typeof pi === "string" ? pi : (pi?.id ?? null);
}

/** Zapíše varovný záznam jen jednou pro danou platbu (idempotentní). */
async function warnOnce(db: Db, orderId: string, kind: string, meta: Record<string, unknown>, key: string) {
  await db.execute(sql`
    INSERT INTO order_activity (order_id, actor_type, author_name, kind, metadata)
    SELECT ${orderId}, 'system', 'Stripe', ${kind}, ${JSON.stringify(meta)}::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM order_activity WHERE order_id = ${orderId} AND kind = ${kind} AND metadata->>'key' = ${key}
    )`);
}

export async function handleStripeEvent(db: Db, event: Pick<Stripe.Event, "id" | "type" | "data">): Promise<WebhookOutcome> {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded" &&
    event.type !== "checkout.session.async_payment_failed" &&
    event.type !== "checkout.session.expired"
  ) {
    return "ignored-event";
  }
  const session = event.data.object as SessionLike;
  if (session.metadata?.source !== STRIPE_SOURCE) return "ignored-foreign";
  const orderId = session.client_reference_id ?? "";
  if (!UUID.test(orderId) || session.metadata?.orderId !== orderId) return "ignored-foreign";

  const rows = (
    await db.execute(sql`SELECT total_kc, payment_status, payment_vs FROM orders WHERE id = ${orderId} AND channel = 'eshop'`)
  ).rows as { total_kc: number; payment_status: string; payment_vs: string | null }[];
  const order = rows[0];
  if (!order) return "ignored-unknown-order";
  const requiredHal = order.total_kc * 100;
  const attempt = {
    orderId,
    checkoutSessionId: session.id,
    amountHal: session.amount_total ?? requiredHal,
    vs: order.payment_vs,
  };

  // Zrušená / propadlá / neúspěšná platba: pokus se uzavře, objednávka
  // zůstává nezaplacená a zákazník může zaplatit znovu.
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    await closeStripeAttempt(db, {
      ...attempt,
      status: event.type === "checkout.session.expired" ? "cancelled" : "failed",
    });
    return "no-change";
  }
  if (session.payment_status !== "paid") return "not-paid-yet";

  const pi = paymentIntentId(session);
  const key = pi ?? session.id;
  const mismatchMeta = {
    key,
    provider: "stripe",
    checkoutSession: session.id,
    paymentIntent: pi,
    amount: session.amount_total,
    currency: session.currency,
  };
  // Jiná měna se do plateb nezapíše (evidujeme jen CZK) — jen varování.
  if (session.currency !== "czk" || session.amount_total === null) {
    await warnOnce(db, orderId, "payment_amount_mismatch", mismatchMeta, key);
    return "amount-mismatch";
  }

  // Peníze přišly → platba se zapíše vždy (i s nesedící částkou);
  // Zaplaceno nastaví až přepočet, když je uhrazená celá částka.
  const result = await recordStripeSuccess(db, {
    ...attempt,
    amountHal: session.amount_total,
    paymentIntentId: pi,
    eventId: event.id,
  });
  if (result.settled) return "paid";
  if (session.amount_total !== requiredHal) {
    await warnOnce(db, orderId, "payment_amount_mismatch", mismatchMeta, key);
    return "amount-mismatch";
  }

  // Už zaplaceno: buď opakovaná událost téže platby (nic), nebo zákazník
  // zaplatil podruhé v jiné záložce → varování pro vrácení peněz.
  const same = (
    await db.execute(sql`
      SELECT 1 FROM order_activity
      WHERE order_id = ${orderId} AND kind = 'payment_status_changed' AND metadata->>'key' = ${key}`)
  ).rows;
  if (same.length > 0) return "already-paid";
  await warnOnce(
    db,
    orderId,
    "payment_duplicate",
    { key, provider: "stripe", checkoutSession: session.id, paymentIntent: pi, amount: session.amount_total },
    key
  );
  return "second-payment";
}

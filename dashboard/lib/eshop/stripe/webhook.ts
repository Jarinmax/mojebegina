// ESHOP 1.0 — zpracování událostí ze Stripe (volá se až PO ověření podpisu
// v app/api/eshop/stripe/webhook/route.ts).
//
// Idempotence: Stripe smí stejnou událost poslat víckrát (a platby
// WooCommerce na stejném účtu chodí sem taky). Objednávka se přepne na
// Zaplaceno jediným SQL příkazem (UPDATE ... WHERE payment_status <> 'paid'
// + INSERT aktivity z téhož výsledku) — opakovaná nebo souběžná událost
// nic nezmění a nezapíše druhý záznam.
import { sql } from "drizzle-orm";
import type Stripe from "stripe";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { STRIPE_SOURCE } from "./payment";

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

  // Zrušená / propadlá / neúspěšná platba: objednávka zůstává nezaplacená
  // a zákazník může zaplatit znovu.
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    return "no-change";
  }
  if (session.payment_status !== "paid") return "not-paid-yet";

  const rows = (await db.execute(sql`SELECT total_kc, payment_status FROM orders WHERE id = ${orderId} AND channel = 'eshop'`))
    .rows as { total_kc: number; payment_status: string }[];
  const order = rows[0];
  if (!order) return "ignored-unknown-order";

  const pi = paymentIntentId(session);
  const key = pi ?? session.id;
  if (session.currency !== "czk" || session.amount_total !== order.total_kc * 100) {
    await warnOnce(
      db,
      orderId,
      "payment_amount_mismatch",
      { key, provider: "stripe", checkoutSession: session.id, paymentIntent: pi, amount: session.amount_total, currency: session.currency },
      key
    );
    return "amount-mismatch";
  }

  const meta = JSON.stringify({
    key,
    provider: "stripe",
    to: "paid",
    checkoutSession: session.id,
    paymentIntent: pi,
    eventId: event.id,
  });
  const updated = (
    await db.execute(sql`
      WITH prev AS (
        SELECT id, payment_status FROM orders
        WHERE id = ${orderId} AND channel = 'eshop' AND payment_status <> 'paid'
        FOR UPDATE
      ),
      upd AS (
        UPDATE orders o SET payment_status = 'paid', paid_at = now()
        FROM prev WHERE o.id = prev.id
        RETURNING o.id, prev.payment_status AS from_status
      )
      INSERT INTO order_activity (order_id, actor_type, author_name, kind, metadata)
      SELECT id, 'system', 'Stripe', 'payment_status_changed', ${meta}::jsonb || jsonb_build_object('from', from_status)
      FROM upd
      RETURNING order_id`)
  ).rows;
  if (updated.length > 0) return "paid";

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

// ESHOP 1.0 — platby e-shopových objednávek (tabulka payments, schéma
// ESHOP_FAKTURACE_NAVRH.md / docs/eshop-payments).
//
// Každá platba je samostatný záznam: pokus o platbu kartou (Stripe Checkout
// Session), úspěšná platba kartou, ručně zapsaný převod nebo hotovost.
// Idempotence podle (source, external_id) — opakovaný webhook ani dvojí
// odeslání formuláře nezapíše druhou platbu.
//
// „Zaplaceno“ se NEPŘEPÍNÁ ručně: orders.payment_status = 'paid' nastaví
// jen settleOrderPayment, když pohled order_payment_balance ukáže, že je
// uhrazená celá částka (paid / overpaid). Platba a přepočet běží v jedné
// transakci (db.batch). Přepočet jde jen směrem k Zaplaceno — vratky
// zatím vrací člověk ručně (Stripe / banka) a stav objednávky nemění.
import { desc, eq, sql, type SQL } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { orderPaymentBalance, payments } from "@/lib/db/schema";

type Db = NeonHttpDatabase<typeof schema>;

export type PaymentSource = "stripe" | "bank" | "manual";
export type PaymentMethod = "card" | "bank_transfer" | "cash";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "cancelled" | "superseded" | "refunded";
export type BalanceState = "unpaid" | "partially_paid" | "paid" | "overpaid" | "refunded";

/** Kdo přepočet spustil — zapíše se do historie objednávky. */
export type SettleActor =
  | { type: "system"; name: string }
  | { type: "user"; userId: string; name: string };

/**
 * Přepočet stavu objednávky z plateb: pokud je uhrazená celá částka
 * a objednávka ještě není Zaplaceno, nastaví payment_status = 'paid',
 * paid_at a zapíše „payment_status_changed“ do historie — vše jedním
 * příkazem, souběžné volání přepne jen jednou (FOR UPDATE + podmínka).
 * Jen e-shopové objednávky.
 */
export function settleOrderPaymentSql(
  orderId: string,
  actor: SettleActor,
  paidAt: Date,
  meta: Record<string, unknown>
): SQL {
  const userId = actor.type === "user" ? actor.userId : null;
  return sql`
    WITH bal AS (
      SELECT balance_state FROM order_payment_balance WHERE order_id = ${orderId}
    ),
    prev AS (
      SELECT o.id, o.payment_status FROM orders o
      WHERE o.id = ${orderId} AND o.channel = 'eshop' AND o.payment_status <> 'paid'
        AND (SELECT balance_state FROM bal) IN ('paid', 'overpaid')
      FOR UPDATE OF o
    ),
    upd AS (
      UPDATE orders o SET payment_status = 'paid', paid_at = ${paidAt.toISOString()}::timestamptz
      FROM prev WHERE o.id = prev.id
      RETURNING o.id, prev.payment_status AS from_status
    )
    INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
    SELECT id, ${actor.type}, ${userId}, ${actor.name}, 'payment_status_changed',
      ${JSON.stringify({ ...meta, to: "paid" })}::jsonb || jsonb_build_object('from', from_status)
    FROM upd
    RETURNING order_id`;
}

/** true = tímto voláním se objednávka přepnula na Zaplaceno. */
function settledNow(result: { rows: unknown[] }): boolean {
  return result.rows.length > 0;
}

/** Hodnota pro pole vs: jen číslice 1–10 (VS objednávky), jinak NULL. */
function vsOrNull(vs: string | null | undefined): string | null {
  return vs && /^[0-9]{1,10}$/.test(vs) ? vs : null;
}

/** Pokus o platbu kartou (nová platební stránka Stripe) — „čeká“, nic nezaplatí. */
export async function recordStripeAttempt(
  db: Db,
  input: { orderId: string; checkoutSessionId: string; amountHal: number; vs: string | null }
): Promise<void> {
  await db.execute(sql`
    INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs)
    VALUES (${input.orderId}, 'stripe', ${input.checkoutSessionId}, 'card', 'inflow', 'pending',
      ${input.amountHal}, ${vsOrNull(input.vs)})
    ON CONFLICT (source, external_id) DO NOTHING`);
}

/** Zrušený / propadlý / neúspěšný pokus — jen z „čeká“, proběhlou platbu nepřepíše. */
export async function closeStripeAttempt(
  db: Db,
  input: { orderId: string; checkoutSessionId: string; amountHal: number; vs: string | null; status: "failed" | "cancelled" }
): Promise<void> {
  await db.execute(sql`
    INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs)
    VALUES (${input.orderId}, 'stripe', ${input.checkoutSessionId}, 'card', 'inflow', ${input.status},
      ${input.amountHal}, ${vsOrNull(input.vs)})
    ON CONFLICT (source, external_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
    WHERE payments.status = 'pending'`);
}

export type StripeSuccessResult = {
  /** false = tahle platba už byla zapsaná dřív (opakovaná událost) */
  newlySucceeded: boolean;
  /** true = tímto se objednávka přepnula na Zaplaceno */
  settled: boolean;
};

/**
 * Úspěšná platba kartou: záznam pokusu → „proběhlo“ (nebo nový záznam)
 * a v téže transakci přepočet objednávky.
 */
export async function recordStripeSuccess(
  db: Db,
  input: {
    orderId: string;
    checkoutSessionId: string;
    paymentIntentId: string | null;
    amountHal: number;
    vs: string | null;
    eventId: string;
  }
): Promise<StripeSuccessResult> {
  const now = new Date();
  const raw = JSON.stringify({ paymentIntent: input.paymentIntentId, eventId: input.eventId });
  const [upsert, settle] = await db.batch([
    db.execute(sql`
      INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at, raw)
      VALUES (${input.orderId}, 'stripe', ${input.checkoutSessionId}, 'card', 'inflow', 'succeeded',
        ${input.amountHal}, ${vsOrNull(input.vs)}, ${now.toISOString()}::timestamptz, ${raw}::jsonb)
      ON CONFLICT (source, external_id) DO UPDATE SET status = 'succeeded', amount_hal = EXCLUDED.amount_hal,
        occurred_at = EXCLUDED.occurred_at, raw = EXCLUDED.raw, updated_at = now()
      WHERE payments.status <> 'succeeded'
      RETURNING id`),
    db.execute(
      settleOrderPaymentSql(input.orderId, { type: "system", name: "Stripe" }, now, {
        key: input.paymentIntentId ?? input.checkoutSessionId,
        provider: "stripe",
        checkoutSession: input.checkoutSessionId,
        paymentIntent: input.paymentIntentId,
        eventId: input.eventId,
      })
    ),
  ]);
  return { newlySucceeded: upsert.rows.length > 0, settled: settledNow(settle) };
}

export type ManualPaymentInput = {
  orderId: string;
  /** jednorázový token formuláře — dvojí odeslání nezapíše druhou platbu */
  token: string;
  method: Exclude<PaymentMethod, "card">;
  amountHal: number;
  occurredAt: Date;
  note: string | null;
  vs: string | null;
  user: { userId: string; name: string };
};

export type ManualPaymentResult = { recorded: boolean; settled: boolean };

/** Ručně zapsaná platba (převod / hotovost) z MojeBegina + přepočet v jedné transakci. */
export async function recordManualPayment(db: Db, input: ManualPaymentInput): Promise<ManualPaymentResult> {
  const meta = JSON.stringify({ amountHal: input.amountHal, method: input.method, token: input.token });
  const [insert, , settle] = await db.batch([
    db.execute(sql`
      INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at,
        recorded_by_user_id, note)
      VALUES (${input.orderId}, 'manual', ${input.token}, ${input.method}, 'inflow', 'succeeded', ${input.amountHal},
        ${vsOrNull(input.vs)}, ${input.occurredAt.toISOString()}::timestamptz, ${input.user.userId}, ${input.note})
      ON CONFLICT (source, external_id) DO NOTHING
      RETURNING id`),
    // historie: jen u skutečně nově zapsané platby (stejný token = nic)
    db.execute(sql`
      INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
      SELECT ${input.orderId}, 'user', ${input.user.userId}, ${input.user.name}, 'payment_recorded', ${meta}::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM order_activity WHERE order_id = ${input.orderId} AND kind = 'payment_recorded'
          AND metadata->>'token' = ${input.token}
      )`),
    db.execute(
      settleOrderPaymentSql(input.orderId, { type: "user", ...input.user }, input.occurredAt, {
        key: `manual:${input.token}`,
        provider: "manual",
        method: input.method,
      })
    ),
  ]);
  return { recorded: insert.rows.length > 0, settled: settledNow(settle) };
}

export type OrderPaymentRow = {
  id: string;
  source: string;
  method: string;
  direction: string;
  status: string;
  amountHal: number;
  occurredAt: Date | null;
  createdAt: Date;
  note: string | null;
};

export type OrderPaymentSummary = {
  requiredHal: number;
  receivedHal: number;
  refundedHal: number;
  netHal: number;
  remainingHal: number;
  balanceState: BalanceState;
  payments: OrderPaymentRow[];
};

export async function loadOrderPayments(db: Db, orderId: string): Promise<OrderPaymentSummary | null> {
  const [balance] = await db.select().from(orderPaymentBalance).where(eq(orderPaymentBalance.orderId, orderId)).limit(1);
  if (!balance) return null;
  const rows = await db
    .select({
      id: payments.id,
      source: payments.source,
      method: payments.method,
      direction: payments.direction,
      status: payments.status,
      amountHal: payments.amountHal,
      occurredAt: payments.occurredAt,
      createdAt: payments.createdAt,
      note: payments.note,
    })
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.createdAt));
  const net = Number(balance.netHal);
  const required = Number(balance.requiredHal);
  return {
    requiredHal: required,
    receivedHal: Number(balance.receivedHal),
    refundedHal: Number(balance.refundedHal),
    netHal: net,
    remainingHal: Math.max(0, required - net),
    balanceState: balance.balanceState as BalanceState,
    payments: rows.map((r) => ({ ...r, amountHal: Number(r.amountHal) })),
  };
}

/** Částka v Kč z formuláře („379“, „379,50“, „1 137,00“) → haléře; null = neplatná. */
export function parseAmountKcToHal(raw: string): number | null {
  const cleaned = raw.replace(/[\s ]/g, "").replace(/kč$/i, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const hal = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return hal > 0 ? hal : null;
}

// Storno objednávky a peníze (zadání majitele 8. 10. 2026).
//
// Zásada: peníze za stornovanou objednávku NEZNAMENAJÍ automaticky
// vrácení. Nejdřív se kontaktuje zákazník a nabídne se mu jiný produkt
// nebo nová objednávka; podle JEHO rozhodnutí se platba buď převede na
// jinou objednávku, nebo se vrátí (a oprávněné vrácení se nezdržuje).
//
//   storno zaplacené objednávky / platba po stornu
//     → objednávka zůstává Stornovaná a NIKDY se nepřepne na Zaplaceno
//       (settleOrderPaymentSql) — žádná faktura, žádný e-mail o platbě
//     → upozornění „Platba po stornu – kontaktovat zákazníka“
//   zákazník souhlasí s jiným produktem → převod platby na jeho e-shopovou
//     objednávku (původní záznam „superseded“ → nový záznam u cílové
//     objednávky; transakce zůstává dohledatelná, nic se nezapočítá dvakrát)
//   zákazník požaduje vrácení → „Vrátit peníze“ → zápis skutečného vrácení
//     (výdej s ID transakce, refund_of_payment_id)
//
// Stav se počítá z dat (order_payment_balance + historie), ne z ručních
// příznaků: upozornění zmizí, jakmile Begina za objednávku nedrží nic.
// Každý krok je v historii objednávky; souhlas zákazníka je povinný
// (zaškrtnutí + poznámka, jak a kdy souhlasil). Duplicity hlídá
// UNIQUE (source, external_id) — ID transakce je klíč.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { orderActivity, orderPaymentBalance, orders } from "@/lib/db/schema";
import { sendOrderEmails, type OrderEmailOutcome, type SendOrderEmailsOptions } from "./email/orderEmails";
import { settleOrderPaymentSql } from "./payments";

type Db = NeonHttpDatabase<typeof schema>;

export const CANCELLED = "cancelled";
export const PAYMENT_AFTER_CANCELLATION = "payment_after_cancellation";
export const REFUND_REQUESTED = "refund_requested";
export const REFUND_RECORDED = "refund_recorded";
export const PAYMENT_TRANSFERRED_OUT = "payment_transferred_out";
export const PAYMENT_TRANSFERRED_IN = "payment_transferred_in";

export type UserActor = { userId: string; name: string };
export type ManualMethod = "bank_transfer" | "cash";
export type RefundMethod = "bank_transfer" | "cash" | "card";

/** Kolik peněz za objednávku Begina drží (haléře) — 0 = nic. */
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

export type CancelledMoney = {
  /** contact = kontaktovat zákazníka; refund = zákazník požaduje vrácení */
  stage: "contact" | "refund";
  heldHal: number;
};

/**
 * Stornované e-shopové objednávky, za které Begina drží peníze, a v jaké
 * fázi jsou. Ostatní objednávky v mapě nejsou.
 */
export async function cancelledMoneyState(db: Db, orderIds: string[]): Promise<Map<string, CancelledMoney>> {
  const result = new Map<string, CancelledMoney>();
  if (orderIds.length === 0) return result;
  const rows = await db
    .select({ orderId: orderPaymentBalance.orderId, netHal: orderPaymentBalance.netHal })
    .from(orderPaymentBalance)
    .innerJoin(orders, eq(orders.id, orderPaymentBalance.orderId))
    .where(and(inArray(orderPaymentBalance.orderId, orderIds), eq(orders.fulfillmentStatus, CANCELLED), eq(orders.channel, "eshop")));
  const held = rows.filter((r) => Number(r.netHal) > 0);
  if (held.length === 0) return result;
  const requested = await db
    .select({ orderId: orderActivity.orderId })
    .from(orderActivity)
    .where(and(inArray(orderActivity.orderId, held.map((r) => r.orderId)), eq(orderActivity.kind, REFUND_REQUESTED)));
  const refund = new Set(requested.map((r) => r.orderId));
  for (const r of held) result.set(r.orderId, { stage: refund.has(r.orderId) ? "refund" : "contact", heldHal: Number(r.netHal) });
  return result;
}

export type CancellationOutcome = {
  /** peníze, které Begina za objednávku drží (haléře); 0 = nezaplaceno */
  heldHal: number;
  /** e-mail zákazníkovi (null = objednávka není z e-shopu nebo e-maily vypnuté) */
  email: OrderEmailOutcome | null;
};

/**
 * Po skutečném přepnutí na „Stornovaná“: e-mail zákazníkovi (nejvýš jednou).
 * Nic se automaticky neoznačuje k vrácení — zaplacená objednávka dostane
 * upozornění „kontaktovat zákazníka“ z dat. Nikdy nevyhazuje výjimku.
 */
export async function afterOrderCancelled(
  db: Db,
  orderId: string,
  baseUrl: string,
  email: SendOrderEmailsOptions = {}
): Promise<CancellationOutcome> {
  let heldHal = 0;
  try {
    heldHal = await heldAmountHal(db, orderId);
  } catch (error) {
    console.error("Storno: držené peníze se nepodařilo zjistit", orderId, error);
  }
  const outcomes = await sendOrderEmails(db, orderId, "order_cancelled", baseUrl, { ...email, cancellation: { heldHal } });
  return { heldHal, email: outcomes.find((o) => o.template === "customer_cancellation") ?? null };
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

/** ID transakce z banky / pokladny: bez okrajových mezer, 3–100 znaků. */
export function normalizeTxId(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ");
  return value.length >= 3 && value.length <= 100 ? value : null;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function loadCancelled(db: Db, orderId: string) {
  const [order] = await db
    .select({
      id: orders.id,
      channel: orders.channel,
      fulfillmentStatus: orders.fulfillmentStatus,
      paymentVs: orders.paymentVs,
      contactEmail: orders.contactEmail,
      orderNumber: orders.orderNumber,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return { error: "Objednávka nebyla nalezena." } as const;
  if (order.channel !== "eshop") return { error: "Platby se evidují jen u e-shopových objednávek." } as const;
  if (order.fulfillmentStatus !== CANCELLED) return { error: "Objednávka není stornovaná." } as const;
  return { order } as const;
}

/**
 * Platba přijatá po stornu (převod / hotovost) — zapíše se s ID transakce,
 * objednávka zůstává Stornovaná a nezaplacená. Stejné ID transakce podruhé
 * (i u jiné objednávky) = nic se nezapíše.
 */
export async function recordPaymentAfterCancellation(
  db: Db,
  input: {
    orderId: string;
    txId: string;
    method: ManualMethod;
    amountHal: number;
    occurredAt: Date;
    note: string | null;
    user: UserActor;
  }
): Promise<Result<{ recorded: boolean }>> {
  const loaded = await loadCancelled(db, input.orderId);
  if ("error" in loaded) return { ok: false, error: loaded.error ?? "Objednávka nebyla nalezena." };
  const externalId = `tx:${input.txId}`;
  const meta = { amountHal: input.amountHal, method: input.method, txId: input.txId, provider: "manual" };
  const inserted = await db.execute(sql`
    WITH ins AS (
      INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at,
        recorded_by_user_id, note)
      VALUES (${input.orderId}, 'manual', ${externalId}, ${input.method}, 'inflow', 'succeeded', ${input.amountHal},
        ${loaded.order.paymentVs}, ${input.occurredAt.toISOString()}::timestamptz, ${input.user.userId}, ${input.note})
      ON CONFLICT (source, external_id) DO NOTHING
      RETURNING id
    )
    INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
    SELECT ${input.orderId}, 'user', ${input.user.userId}, ${input.user.name}, ${PAYMENT_AFTER_CANCELLATION},
      ${JSON.stringify(meta)}::jsonb || jsonb_build_object('paymentId', ins.id)
    FROM ins
    RETURNING id`);
  if (inserted.rows.length > 0) return { ok: true, recorded: true };
  const [existing] = (
    await db.execute(sql`SELECT order_id FROM payments WHERE source = 'manual' AND external_id = ${externalId}`)
  ).rows as { order_id: string | null }[];
  if (existing && existing.order_id !== input.orderId) {
    return { ok: false, error: "Platba s tímto ID transakce už je zapsaná u jiné objednávky." };
  }
  return { ok: true, recorded: false };
}

/** Zákazník požaduje vrácení peněz (jeho rozhodnutí, s poznámkou). Opakovaně = nic. */
export async function requestRefund(
  db: Db,
  input: { orderId: string; note: string; user: UserActor }
): Promise<Result<{ requested: boolean; heldHal: number }>> {
  const loaded = await loadCancelled(db, input.orderId);
  if ("error" in loaded) return { ok: false, error: loaded.error ?? "Objednávka nebyla nalezena." };
  const heldHal = await heldAmountHal(db, input.orderId);
  if (heldHal <= 0) return { ok: false, error: "Za objednávku nedržíme žádné peníze." };
  const inserted = await db.execute(sql`
    INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, body, metadata)
    SELECT ${input.orderId}, 'user', ${input.user.userId}, ${input.user.name}, ${REFUND_REQUESTED}, ${input.note},
      ${JSON.stringify({ amountHal: heldHal, consent: true })}::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM order_activity WHERE order_id = ${input.orderId} AND kind = ${REFUND_REQUESTED})
    RETURNING id`);
  return { ok: true, requested: inserted.rows.length > 0, heldHal };
}

/**
 * Skutečně vrácené peníze (výdej s ID transakce). Jen po rozhodnutí
 * zákazníka o vrácení a nejvýš do výše držených peněz — kontrola i zápis
 * běží v jedné transakci se zámkem objednávky (souběžné zápisy nevrátí víc).
 */
export async function recordRefund(
  db: Db,
  input: {
    orderId: string;
    txId: string;
    method: RefundMethod;
    amountHal: number;
    occurredAt: Date;
    note: string | null;
    user: UserActor;
  }
): Promise<Result<{ recorded: boolean; remainingHal: number }>> {
  const loaded = await loadCancelled(db, input.orderId);
  if ("error" in loaded) return { ok: false, error: loaded.error ?? "Objednávka nebyla nalezena." };
  const state = (await cancelledMoneyState(db, [input.orderId])).get(input.orderId);
  const externalId = `refund:${input.txId}`;
  const meta = { amountHal: input.amountHal, method: input.method, txId: input.txId };
  // už zapsané vrácení se stejným ID = opakované odeslání formuláře (nic)
  const [same] = (
    await db.execute(sql`SELECT order_id FROM payments WHERE source = 'manual' AND external_id = ${externalId}`)
  ).rows as { order_id: string | null }[];
  if (same?.order_id === input.orderId) return { ok: true, recorded: false, remainingHal: state?.heldHal ?? 0 };
  if (same) return { ok: false, error: "Vrácení s tímto ID transakce už je zapsané u jiné objednávky." };
  if (state?.stage !== "refund") {
    return {
      ok: false,
      error: state ? "Vrácení zapište až po rozhodnutí zákazníka („Zákazník požaduje vrácení“)." : "Za objednávku nedržíme žádné peníze.",
    };
  }
  if (input.amountHal > state.heldHal) {
    return { ok: false, error: `Vrátit lze nejvýš ${(state.heldHal / 100).toLocaleString("cs-CZ")} Kč (tolik za objednávku držíme).` };
  }
  const [, inserted] = await db.batch([
    db.execute(sql`SELECT id FROM orders WHERE id = ${input.orderId} FOR UPDATE`),
    db.execute(sql`
      WITH ins AS (
        INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at,
          recorded_by_user_id, note, refund_of_payment_id)
        SELECT ${input.orderId}, 'manual', ${externalId}, ${input.method}, 'outflow', 'succeeded', ${input.amountHal},
          ${loaded.order.paymentVs}, ${input.occurredAt.toISOString()}::timestamptz, ${input.user.userId}, ${input.note},
          (SELECT id FROM payments WHERE order_id = ${input.orderId} AND direction = 'inflow' AND status = 'succeeded'
             AND match_status = 'matched' ORDER BY occurred_at, created_at LIMIT 1)
        WHERE (SELECT net_hal FROM order_payment_balance WHERE order_id = ${input.orderId}) >= ${input.amountHal}
        ON CONFLICT (source, external_id) DO NOTHING
        RETURNING id
      )
      INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
      SELECT ${input.orderId}, 'user', ${input.user.userId}, ${input.user.name}, ${REFUND_RECORDED},
        ${JSON.stringify(meta)}::jsonb || jsonb_build_object('paymentId', ins.id)
      FROM ins
      RETURNING id`),
  ]);
  const remainingHal = await heldAmountHal(db, input.orderId);
  if (inserted.rows.length > 0) return { ok: true, recorded: true, remainingHal };
  // souběžné odeslání téhož vrácení
  const [now] = (
    await db.execute(sql`SELECT order_id FROM payments WHERE source = 'manual' AND external_id = ${externalId}`)
  ).rows as { order_id: string | null }[];
  if (now?.order_id === input.orderId) return { ok: true, recorded: false, remainingHal };
  if (now) return { ok: false, error: "Vrácení s tímto ID transakce už je zapsané u jiné objednávky." };
  return { ok: false, error: "Částka je vyšší, než kolik za objednávku držíme — obnovte stránku." };
}

export type TransferTarget = {
  id: string;
  orderNumber: number | null;
  paymentVs: string | null;
  contactName: string | null;
  contactEmail: string | null;
};

/**
 * Zákazník souhlasí s jiným produktem → všechny přijaté platby stornované
 * objednávky se převedou na jeho e-shopovou objednávku (číslo nebo VS).
 * Jen celé platby a jen dokud se nic nevracelo. Jedna transakce: zámek
 * obou objednávek → nový záznam u cílové objednávky (external_id
 * „transfer:<id původní platby>“ — podruhé nejde) → původní „superseded“
 * → historie u obou → přepočet cílové objednávky (Zaplaceno při úplné úhradě).
 */
export async function transferPayments(
  db: Db,
  input: { fromOrderId: string; target: string; note: string; allowDifferentCustomer: boolean; user: UserActor }
): Promise<Result<{ movedHal: number; settled: boolean; target: TransferTarget }>> {
  const loaded = await loadCancelled(db, input.fromOrderId);
  if ("error" in loaded) return { ok: false, error: loaded.error ?? "Objednávka nebyla nalezena." };
  const wanted = input.target.trim().replace(/\s+/g, "");
  if (!/^\d{1,12}$/.test(wanted)) return { ok: false, error: "Zadejte číslo nebo variabilní symbol cílové objednávky." };
  const candidates = (
    await db.execute(sql`
      SELECT id, channel, fulfillment_status, payment_status, order_number, payment_vs, contact_name, contact_email
      FROM orders WHERE payment_vs = ${wanted} OR order_number::text = ${wanted}`)
  ).rows as {
    id: string;
    channel: string;
    fulfillment_status: string;
    payment_status: string;
    order_number: number | null;
    payment_vs: string | null;
    contact_name: string | null;
    contact_email: string | null;
  }[];
  if (candidates.length === 0) return { ok: false, error: `Objednávka ${wanted} nebyla nalezena.` };
  if (candidates.length > 1) return { ok: false, error: `Údaj ${wanted} odpovídá více objednávkám — zadejte variabilní symbol.` };
  const target = candidates[0];
  if (target.id === input.fromOrderId) return { ok: false, error: "Platbu nelze převést na tutéž objednávku." };
  if (target.channel !== "eshop") return { ok: false, error: "Platbu lze převést jen na e-shopovou objednávku." };
  if (target.fulfillment_status === CANCELLED) return { ok: false, error: "Cílová objednávka je stornovaná." };
  if (target.payment_status === "paid") return { ok: false, error: "Cílová objednávka už je zaplacená." };
  const sameCustomer =
    (target.contact_email ?? "").trim().toLowerCase() === (loaded.order.contactEmail ?? "").trim().toLowerCase();
  if (!sameCustomer && !input.allowDifferentCustomer) {
    return {
      ok: false,
      error: `Cílová objednávka patří jinému e-mailu (${target.contact_email ?? "bez e-mailu"}). Pokud je to správně, potvrďte jiného zákazníka.`,
    };
  }
  const [{ refunds }] = (
    await db.execute(sql`SELECT count(*)::int AS refunds FROM payments WHERE order_id = ${input.fromOrderId} AND direction = 'outflow'`)
  ).rows as { refunds: number }[];
  if (refunds > 0) return { ok: false, error: "Část peněz už byla vrácena — převod celé platby nejde." };

  const fromRef = loaded.order.orderNumber !== null ? String(loaded.order.orderNumber) : (loaded.order.paymentVs ?? input.fromOrderId.slice(0, 8));
  const toRef = target.order_number !== null ? String(target.order_number) : (target.payment_vs ?? target.id.slice(0, 8));
  const now = new Date();
  const [, moved, settle] = await db.batch([
    db.execute(sql`SELECT id FROM orders WHERE id IN (${input.fromOrderId}, ${target.id}) ORDER BY id FOR UPDATE`),
    db.execute(sql`
      WITH src AS (
        SELECT p.* FROM payments p
        WHERE p.order_id = ${input.fromOrderId} AND p.direction = 'inflow' AND p.status = 'succeeded' AND p.match_status = 'matched'
          AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.order_id = ${input.fromOrderId} AND r.direction = 'outflow')
          AND (SELECT fulfillment_status FROM orders WHERE id = ${input.fromOrderId}) = 'cancelled'
          AND (SELECT fulfillment_status FROM orders WHERE id = ${target.id}) <> 'cancelled'
      ),
      ins AS (
        INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at,
          recorded_by_user_id, note, raw)
        SELECT ${target.id}, 'manual', 'transfer:' || src.id, src.method, 'inflow', 'succeeded', src.amount_hal,
          ${target.payment_vs}, src.occurred_at, ${input.user.userId},
          ${`Převedeno ze stornované objednávky ${fromRef} se souhlasem zákazníka`},
          jsonb_build_object('transferredFromOrderId', ${input.fromOrderId}::text, 'originalPaymentId', src.id::text,
            'originalSource', src.source, 'originalExternalId', src.external_id, 'originalVs', src.vs)
        FROM src
        ON CONFLICT (source, external_id) DO NOTHING
        RETURNING id, amount_hal, (raw->>'originalPaymentId')::uuid AS original_id
      ),
      upd AS (
        UPDATE payments p SET status = 'superseded', superseded_by_payment_id = ins.id, updated_at = now()
        FROM ins WHERE p.id = ins.original_id
        RETURNING p.id
      ),
      total AS (SELECT sum(amount_hal)::bigint AS hal, array_agg(id::text) AS ids FROM ins),
      act_out AS (
        INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, body, metadata)
        SELECT ${input.fromOrderId}, 'user', ${input.user.userId}, ${input.user.name}, ${PAYMENT_TRANSFERRED_OUT}, ${input.note},
          jsonb_build_object('amountHal', total.hal, 'toOrderId', ${target.id}::text, 'toReference', ${toRef}::text, 'consent', true)
        FROM total WHERE total.hal IS NOT NULL
      ),
      act_in AS (
        INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, body, metadata)
        SELECT ${target.id}, 'user', ${input.user.userId}, ${input.user.name}, ${PAYMENT_TRANSFERRED_IN}, ${input.note},
          jsonb_build_object('amountHal', total.hal, 'fromOrderId', ${input.fromOrderId}::text, 'fromReference', ${fromRef}::text,
            'paymentIds', total.ids, 'consent', true)
        FROM total WHERE total.hal IS NOT NULL
      )
      SELECT hal FROM total`),
    db.execute(
      settleOrderPaymentSql(target.id, { type: "user", ...input.user }, now, {
        key: `transfer:${input.fromOrderId}`,
        provider: "manual",
        transferFromOrderId: input.fromOrderId,
      })
    ),
  ]);
  const movedHal = Number((moved.rows[0] as { hal: string | number | null } | undefined)?.hal ?? 0);
  if (movedHal <= 0) return { ok: false, error: "Není co převést — platba už byla převedena nebo vrácena." };
  return {
    ok: true,
    movedHal,
    settled: settle.rows.length > 0,
    target: {
      id: target.id,
      orderNumber: target.order_number,
      paymentVs: target.payment_vs,
      contactName: target.contact_name,
      contactEmail: target.contact_email,
    },
  };
}

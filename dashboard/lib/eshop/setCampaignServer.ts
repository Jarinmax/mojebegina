import "server-only";

// Kampaň „Ochutnávkový set sirupů“ — čtení z DB pro e-mail s kódem,
// provizi a přehledy (pravidla viz setCampaign.ts). Zapisuje se jen
// záznam o odeslaném e-mailu (set_coupon_emails), nic jiného.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loadPartnerOptOuts } from "./partnerMonthlyServer";
import {
  COMMISSION_MONTHS,
  COUPON_EMAIL_AFTER_DAYS,
  COUPON_EMAIL_MAX_AGE_DAYS,
  buildCommission,
  type CampaignStats,
  type CommissionReport,
} from "./setCampaign";
import { SET_CAMPAIGN_SKU, SET_COUPON_CODE, SET_SKU } from "./tastingSet";
import { soldCampaignSets } from "./tastingSetServer";

type Row = Record<string, unknown>;
const rowsOf = (result: { rows?: unknown[] }) => (result.rows ?? []) as Row[];

async function tableReady(): Promise<boolean> {
  try {
    const exists = await db.execute(sql`SELECT to_regclass('public.set_coupon_emails') IS NOT NULL AS present`);
    return rowsOf(exists)[0]?.present === true;
  } catch {
    return false;
  }
}

export type DueCouponEmail = { orderId: string; email: string; customerName: string | null };

/**
 * Objednávky z e-shopu se setem, odeslané před 5–30 dny (první předání
 * dopravci nebo na rozvoz), kterým kód ještě neodešel, nejsou stornované
 * a e-mail není odhlášený z obchodních sdělení.
 */
export async function dueCouponEmails(): Promise<DueCouponEmail[]> {
  if (!(await tableReady())) return [];
  const result = await db.execute(sql`
    SELECT o.id, lower(trim(o.contact_email)) AS email, COALESCE(o.billing_name, o.contact_name, o.recipient_name) AS customer_name
    FROM orders o
    JOIN LATERAL (
      SELECT min(a.created_at) AS at FROM order_activity a
      WHERE a.order_id = o.id AND a.kind = 'fulfillment_status_changed'
        AND a.metadata->>'to' IN ('out_for_delivery', 'handed_to_carrier', 'delivered')
    ) d ON d.at IS NOT NULL
    WHERE o.channel = 'eshop' AND o.fulfillment_status <> 'cancelled' AND o.contact_email IS NOT NULL
      AND d.at <= now() - make_interval(days => ${COUPON_EMAIL_AFTER_DAYS})
      AND d.at >= now() - make_interval(days => ${COUPON_EMAIL_MAX_AGE_DAYS})
      AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.sku_snapshot IN (${SET_CAMPAIGN_SKU}, ${SET_SKU}))
      AND NOT EXISTS (SELECT 1 FROM set_coupon_emails q WHERE q.order_id = o.id)
      AND NOT EXISTS (SELECT 1 FROM email_optouts x WHERE x.email = lower(trim(o.contact_email)))
    ORDER BY d.at
    LIMIT 50
  `);
  const refused = new Set(await loadPartnerOptOuts(db));
  return rowsOf(result)
    .map((row) => ({ orderId: String(row.id), email: String(row.email), customerName: (row.customer_name as string | null) ?? null }))
    .filter((row) => !refused.has(row.email));
}

/** Zabere e-mail pro objednávku; false = už ho zabral jiný běh (jen jednou). */
export async function claimCouponEmail(orderId: string): Promise<boolean> {
  const result = await db.execute(sql`INSERT INTO set_coupon_emails (order_id) VALUES (${orderId}::uuid) ON CONFLICT (order_id) DO NOTHING RETURNING order_id`);
  return rowsOf(result).length === 1;
}
export async function releaseCouponEmail(orderId: string): Promise<void> {
  await db.execute(sql`DELETE FROM set_coupon_emails WHERE order_id = ${orderId}::uuid`);
}

// Zákazník z kampaně („Kampaň set“) = e-mail, jehož úplně první
// nestornovaná objednávka obsahuje set za akční cenu.
const CAMPAIGN_CUSTOMERS = sql`
  SELECT f.email, f.id, f.ordered_at FROM (
    SELECT DISTINCT ON (lower(trim(o.contact_email))) lower(trim(o.contact_email)) AS email, o.id, o.ordered_at
    FROM orders o
    WHERE o.contact_email IS NOT NULL AND o.fulfillment_status <> 'cancelled'
    ORDER BY lower(trim(o.contact_email)), o.ordered_at
  ) f
  WHERE EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = f.id AND oi.sku_snapshot = ${SET_CAMPAIGN_SKU})
`;

/** Provize za měsíc "YYYY-MM" (pražský čas) — objednávky zaplacené v tom měsíci. */
export async function loadCommission(month: string): Promise<CommissionReport> {
  const from = `${month}-01`;
  const sets = await db.execute(sql`
    SELECT COALESCE(sum(oi.quantity), 0)::int AS sets
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.sku_snapshot = ${SET_CAMPAIGN_SKU} AND o.payment_status = 'paid' AND o.fulfillment_status <> 'cancelled'
      AND o.paid_at >= (${from}::date)::timestamp AT TIME ZONE 'Europe/Prague'
      AND o.paid_at < (${from}::date + interval '1 month')::timestamp AT TIME ZONE 'Europe/Prague'
  `);
  const later = await db.execute(sql`
    WITH camp AS (${CAMPAIGN_CUSTOMERS})
    SELECT COALESCE(o.order_number::text, left(o.id::text, 8)) AS number, o.paid_at, (o.subtotal_kc - o.discount_kc) AS goods_kc
    FROM orders o JOIN camp c ON lower(trim(o.contact_email)) = c.email
    WHERE o.id <> c.id AND o.ordered_at > c.ordered_at
      AND o.ordered_at < c.ordered_at + make_interval(months => ${COMMISSION_MONTHS})
      AND o.payment_status = 'paid' AND o.fulfillment_status <> 'cancelled'
      AND o.paid_at >= (${from}::date)::timestamp AT TIME ZONE 'Europe/Prague'
      AND o.paid_at < (${from}::date + interval '1 month')::timestamp AT TIME ZONE 'Europe/Prague'
    ORDER BY o.paid_at
  `);
  return buildCommission(
    month,
    Number(rowsOf(sets)[0]?.sets ?? 0),
    rowsOf(later).map((row) => ({ number: String(row.number), paidAt: new Date(String(row.paid_at)), goodsKc: Math.max(0, Number(row.goods_kc)) }))
  );
}

/** Čísla pro sobotní přehled a stránku v Řízení firmy. */
export async function loadCampaignStats(): Promise<CampaignStats> {
  const sets = await db.execute(sql`
    SELECT COALESCE(sum(oi.quantity), 0)::int AS total,
           COALESCE(sum(oi.quantity) FILTER (WHERE o.ordered_at > now() - interval '7 days'), 0)::int AS week
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.sku_snapshot IN (${SET_CAMPAIGN_SKU}, ${SET_SKU}) AND o.fulfillment_status <> 'cancelled'
  `);
  const coupon = await db.execute(sql`
    SELECT count(DISTINCT o.id)::int AS uses
    FROM orders o JOIN order_activity a ON a.order_id = o.id AND a.kind = 'created'
    WHERE o.fulfillment_status <> 'cancelled'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(a.metadata->'coupons', '[]'::jsonb)) c WHERE c->>'code' = ${SET_COUPON_CODE})
  `);
  const customers = await db.execute(sql`
    WITH camp AS (${CAMPAIGN_CUSTOMERS})
    SELECT count(*)::int AS customers,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM orders o WHERE lower(trim(o.contact_email)) = c.email AND o.id <> c.id
               AND o.ordered_at > c.ordered_at AND o.fulfillment_status <> 'cancelled'
           ))::int AS returning
    FROM camp c
  `);
  return {
    setsTotal: Number(rowsOf(sets)[0]?.total ?? 0),
    setsWeek: Number(rowsOf(sets)[0]?.week ?? 0),
    campaignSold: (await soldCampaignSets()) ?? 0,
    couponUses: Number(rowsOf(coupon)[0]?.uses ?? 0),
    campaignCustomers: Number(rowsOf(customers)[0]?.customers ?? 0),
    returningCustomers: Number(rowsOf(customers)[0]?.returning ?? 0),
  };
}

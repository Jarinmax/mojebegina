import "server-only";

// Objednávky po termínu — načtení kandidátů z DB (viz overdueOrders.ts).
// Jen čtení; nic se nezapisuje a zákazníkům se nic neposílá.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { buildOverdueReport, type OverdueCandidate, type OverdueReport } from "./overdueOrders";

type Row = Record<string, unknown>;

export async function loadOverdueCandidates(): Promise<OverdueCandidate[]> {
  const result = await db.execute(sql`
    SELECT o.id, o.channel, o.fulfillment_status, o.total_kc, o.paid_at, o.carrier,
           COALESCE(o.order_number::text, o.external_woocommerce_id, left(o.id::text, 8)) AS number,
           COALESCE(o.billing_company, org.name, o.billing_name, o.contact_name, o.recipient_name, o.contact_email, '—') AS customer,
           (SELECT max(a.created_at) FROM order_activity a
             WHERE a.order_id = o.id AND a.kind = 'fulfillment_status_changed'
               AND a.metadata->>'to' IN ('out_for_delivery', 'handed_to_carrier')) AS shipped_at
    FROM orders o
    LEFT JOIN organizations org ON org.id = o.buyer_organization_id
    WHERE o.fulfillment_status NOT IN ('delivered', 'cancelled')
      AND (o.paid_at IS NOT NULL OR o.fulfillment_status IN ('out_for_delivery', 'handed_to_carrier'))
  `);
  return ((result.rows ?? []) as Row[]).map((row) => ({
    id: String(row.id),
    number: String(row.number),
    customer: String(row.customer),
    channel: String(row.channel),
    fulfillmentStatus: String(row.fulfillment_status),
    totalKc: Number(row.total_kc),
    paidAt: row.paid_at ? new Date(String(row.paid_at)) : null,
    shippedAt: row.shipped_at ? new Date(String(row.shipped_at)) : null,
    carrier: (row.carrier as string | null) ?? null,
  }));
}

export async function loadOverdueReport(now: Date = new Date()): Promise<OverdueReport> {
  return buildOverdueReport(await loadOverdueCandidates(), now);
}

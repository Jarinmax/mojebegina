// Šarže → objednávky (Lucie 21. 11. 2026, krok 4). Při expedici (stav
// Předáno přepravci / Na rozvozu / Doručená) se ke každé položce přiřadí
// šarže stejného produktu a balení — nejdřív ta s nejbližším datem spotřeby.
// Vrácení expedice nebo storno přiřazení zruší. Nikdy nesmí shodit expedici:
// volající chyby jen zaloguje.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export type ItemNeed = { itemId: string; productSlug: string; volumeMl: number; need: number };
export type LineStock = { lineId: string; productSlug: string; volumeMl: number; remaining: number; bestBefore: string | null; producedOn: string };
export type Allocation = { itemId: string; lineId: string; quantity: number };

/** Čistý plán přiřazení: FIFO podle data spotřeby, pak data výroby. */
export function planAllocations(items: ItemNeed[], lines: LineStock[]): { allocations: Allocation[]; missing: Array<{ itemId: string; quantity: number }> } {
  const stock = lines
    .map((l) => ({ ...l }))
    .sort((a, b) => (a.bestBefore ?? "9999").localeCompare(b.bestBefore ?? "9999") || a.producedOn.localeCompare(b.producedOn));
  const allocations: Allocation[] = [];
  const missing: Array<{ itemId: string; quantity: number }> = [];
  for (const item of items) {
    let need = item.need;
    for (const line of stock) {
      if (need <= 0) break;
      if (line.productSlug !== item.productSlug || line.volumeMl !== item.volumeMl || line.remaining <= 0) continue;
      const take = Math.min(need, line.remaining);
      line.remaining -= take;
      need -= take;
      allocations.push({ itemId: item.itemId, lineId: line.lineId, quantity: take });
    }
    if (need > 0) missing.push({ itemId: item.itemId, quantity: need });
  }
  return { allocations, missing };
}

/** Produkt a balení položky objednávky; ochutnávky do podniku se mapují podle SKU na skutečný produkt. */
export function itemTarget(row: { sku: string | null; productSlug: string | null; categorySlug: string | null; volumeMl: number | null }): { productSlug: string; volumeMl: number } | null {
  const sku = row.sku ?? "";
  const tasting = /^ochutnavka-(polevka|sirup|svarak)-(.+)$/.exec(sku);
  if (tasting) return { productSlug: tasting[2], volumeMl: tasting[1] === "sirup" ? 100 : 200 };
  if (!row.productSlug || !row.volumeMl) return null;
  if (row.productSlug.includes("set")) return null;
  return { productSlug: row.productSlug, volumeMl: row.volumeMl };
}

async function tablesExist(): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass('public.production_batch_allocations') IS NOT NULL AS present`);
  return (r.rows?.[0] as { present?: boolean } | undefined)?.present === true;
}

export type AllocationOutcome = { allocated: number; missing: Array<{ name: string; quantity: number }> } | { skipped: string };

export async function allocateOrderBatches(orderId: string): Promise<AllocationOutcome> {
  if (!(await tablesExist())) return { skipped: "no-table" };
  const itemRows = (
    await db.execute(sql`
      SELECT oi.id, oi.name, oi.quantity, oi.sku_snapshot AS sku, p.slug AS product_slug, c.slug AS category_slug, v.volume_ml,
             COALESCE((SELECT sum(a.quantity) FROM production_batch_allocations a WHERE a.order_item_id = oi.id), 0)::int AS allocated
      FROM order_items oi
      LEFT JOIN product_variants v ON v.id = oi.product_variant_id
      LEFT JOIN products p ON p.id = v.product_id
      LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE oi.order_id = ${orderId}::uuid`)
  ).rows as Array<{ id: string; name: string; quantity: number; sku: string | null; product_slug: string | null; category_slug: string | null; volume_ml: number | null; allocated: number }>;
  const needs: ItemNeed[] = [];
  const names = new Map<string, string>();
  for (const r of itemRows) {
    names.set(r.id, r.name);
    const target = itemTarget({ sku: r.sku, productSlug: r.product_slug, categorySlug: r.category_slug, volumeMl: r.volume_ml === null ? null : Number(r.volume_ml) });
    const need = Number(r.quantity) - Number(r.allocated);
    if (target && need > 0) needs.push({ itemId: r.id, ...target, need });
  }
  if (needs.length === 0) return { allocated: 0, missing: [] };
  const slugs = [...new Set(needs.map((n) => n.productSlug))];
  const lineRows = (
    await db.execute(sql`
      SELECT l.id, p.slug AS product_slug, l.volume_ml, l.quantity, l.best_before, b.produced_on,
             COALESCE((SELECT sum(a.quantity) FROM production_batch_allocations a WHERE a.batch_line_id = l.id), 0)::int AS allocated
      FROM production_batch_lines l
      JOIN production_batches b ON b.id = l.batch_id
      JOIN products p ON p.id = b.product_id
      WHERE b.cancelled_at IS NULL AND (l.sold_out_at IS NULL OR l.sold_out_auto) AND p.slug = ANY(${slugs})`)
  ).rows as Array<{ id: string; product_slug: string; volume_ml: number; quantity: number; best_before: string | null; produced_on: string; allocated: number }>;
  const lines: LineStock[] = lineRows.map((l) => ({
    lineId: l.id,
    productSlug: l.product_slug,
    volumeMl: Number(l.volume_ml),
    remaining: Number(l.quantity) - Number(l.allocated),
    bestBefore: l.best_before ? String(l.best_before).slice(0, 10) : null,
    producedOn: String(l.produced_on).slice(0, 10),
  }));
  const plan = planAllocations(needs, lines);
  for (const a of plan.allocations) {
    await db.execute(sql`
      INSERT INTO production_batch_allocations (batch_line_id, order_id, order_item_id, quantity)
      VALUES (${a.lineId}::uuid, ${orderId}::uuid, ${a.itemId}::uuid, ${a.quantity})
      ON CONFLICT (batch_line_id, order_item_id) DO UPDATE SET quantity = production_batch_allocations.quantity + EXCLUDED.quantity`);
  }
  const touched = [...new Set(plan.allocations.map((a) => a.lineId))];
  if (touched.length > 0) {
    await db.execute(sql`
      UPDATE production_batch_lines l SET sold_out_at = now(), sold_out_auto = true
      WHERE l.id = ANY(${touched}::uuid[]) AND l.sold_out_at IS NULL
        AND l.quantity <= COALESCE((SELECT sum(a.quantity) FROM production_batch_allocations a WHERE a.batch_line_id = l.id), 0)`);
  }
  return {
    allocated: plan.allocations.reduce((s, a) => s + a.quantity, 0),
    missing: plan.missing.map((m) => ({ name: names.get(m.itemId) ?? "položka", quantity: m.quantity })),
  };
}

/** Zruší přiřazení šarží objednávky (vrácená expedice, storno); automaticky vyprodané řádky znovu otevře. */
export async function releaseOrderBatches(orderId: string): Promise<void> {
  if (!(await tablesExist())) return;
  const rows = (await db.execute(sql`DELETE FROM production_batch_allocations WHERE order_id = ${orderId}::uuid RETURNING batch_line_id`)).rows as Array<{ batch_line_id: string }>;
  const lines = [...new Set(rows.map((r) => r.batch_line_id))];
  if (lines.length === 0) return;
  await db.execute(sql`
    UPDATE production_batch_lines l SET sold_out_at = NULL, sold_out_auto = false
    WHERE l.id = ANY(${lines}::uuid[]) AND l.sold_out_auto
      AND l.quantity > COALESCE((SELECT sum(a.quantity) FROM production_batch_allocations a WHERE a.batch_line_id = l.id), 0)`);
}

/** Šarže přiřazené k položkám objednávky (pro detail objednávky). */
export async function orderBatchCodes(orderId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!(await tablesExist())) return out;
  const rows = (
    await db.execute(sql`
      SELECT a.order_item_id, b.code, a.quantity FROM production_batch_allocations a
      JOIN production_batch_lines l ON l.id = a.batch_line_id JOIN production_batches b ON b.id = l.batch_id
      WHERE a.order_id = ${orderId}::uuid ORDER BY b.produced_on`)
  ).rows as Array<{ order_item_id: string; code: string; quantity: number }>;
  for (const r of rows) out.set(r.order_item_id, [...(out.get(r.order_item_id) ?? []), `${r.code}${Number(r.quantity) > 1 ? ` (${r.quantity} ks)` : ""}`]);
  return out;
}

export type LineRecipient = { orderId: string; orderNumber: number | null; customer: string; quantity: number; shippedAt: string | null };

/** Komu šly kusy z řádků šarží (dohledatelnost). */
export async function lineRecipients(lineIds: string[]): Promise<Map<string, LineRecipient[]>> {
  const out = new Map<string, LineRecipient[]>();
  if (lineIds.length === 0 || !(await tablesExist())) return out;
  const rows = (
    await db.execute(sql`
      SELECT a.batch_line_id, o.id AS order_id, o.order_number, COALESCE(NULLIF(o.billing_company, ''), o.billing_name, o.contact_name) AS customer,
             a.quantity, o.shipped_at
      FROM production_batch_allocations a JOIN orders o ON o.id = a.order_id
      WHERE a.batch_line_id = ANY(${lineIds}::uuid[]) ORDER BY o.shipped_at NULLS LAST`)
  ).rows as Array<{ batch_line_id: string; order_id: string; order_number: number | null; customer: string | null; quantity: number; shipped_at: string | null }>;
  for (const r of rows)
    out.set(r.batch_line_id, [
      ...(out.get(r.batch_line_id) ?? []),
      { orderId: r.order_id, orderNumber: r.order_number, customer: r.customer ?? "—", quantity: Number(r.quantity), shippedAt: r.shipped_at },
    ]);
  return out;
}

/** Odeslané položky (od spuštění šarží) bez přiřazené šarže — Jarin šarži nezapsal. */
export async function shippedWithoutBatch(sinceIso: string): Promise<Array<{ orderId: string; orderNumber: number | null; name: string; quantity: number }>> {
  if (!(await tablesExist())) return [];
  const rows = (
    await db.execute(sql`
      SELECT o.id AS order_id, o.order_number, oi.name, oi.sku_snapshot AS sku, p.slug AS product_slug, v.volume_ml,
             oi.quantity - COALESCE((SELECT sum(a.quantity) FROM production_batch_allocations a WHERE a.order_item_id = oi.id), 0) AS missing
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      LEFT JOIN product_variants v ON v.id = oi.product_variant_id
      LEFT JOIN products p ON p.id = v.product_id
      WHERE o.shipped_at >= ${sinceIso}::timestamptz AND o.fulfillment_status IN ('handed_to_carrier','out_for_delivery','delivered')
      ORDER BY o.shipped_at DESC LIMIT 200`)
  ).rows as Array<{ order_id: string; order_number: number | null; name: string; sku: string | null; product_slug: string | null; volume_ml: number | null; missing: number }>;
  return rows
    .filter((r) => Number(r.missing) > 0 && itemTarget({ sku: r.sku, productSlug: r.product_slug, categorySlug: null, volumeMl: r.volume_ml === null ? null : Number(r.volume_ml) }))
    .map((r) => ({ orderId: r.order_id, orderNumber: r.order_number, name: r.name, quantity: Number(r.missing) }));
}

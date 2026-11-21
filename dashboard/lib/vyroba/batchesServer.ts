// Šarže (Lucie 21. 11. 2026) — zápis a čtení. Přístup jako u výroby
// (requireOrderContext). Po zápisu jde krátké upozornění na info@begina.cz.
import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, like, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { productCategories, productionBatches, productionBatchLines, products } from "@/lib/db/schema";
import { requireOrderContext } from "@/lib/data/orders";
import { todayPrague } from "@/lib/projekt/projectServer";
import { emailConfig, resolveRecipients } from "@/lib/eshop/email/config";
import { resendTransport } from "@/lib/eshop/email/resend";
import { VOLUME_LABELS, batchCode, bestBefore, daysUntil, formatCzDate, type BatchInput, type BatchVolume } from "./batches";

export const BATCH_SCRIPT = "140_sarze_MAIN";
export const NO_BATCH_TABLE = `Šarže v databázi ještě nejsou — je potřeba spustit v Neonu skript ${BATCH_SCRIPT}.`;
const HIDDEN_CATEGORIES = ["ochutnavka-provoz"];

export async function batchesTableExists(): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('public.production_batches') IS NOT NULL AS present`);
  const row = (result.rows?.[0] ?? null) as { present?: boolean } | null;
  return row?.present === true;
}

export type BatchProduct = { id: string; slug: string; name: string; categorySlug: string; categoryName: string; volumes: number[] };

/** Produkty, které Begina vyrábí (aktivní, bez ochutnávkových setů), s baleními podle e-shopu. */
export async function listBatchProducts(): Promise<BatchProduct[]> {
  const rows = await db.execute(sql`
    SELECT p.id, p.slug, p.name, c.slug AS category_slug, c.name AS category_name,
           COALESCE(array_agg(DISTINCT v.volume_ml) FILTER (WHERE v.is_active AND v.volume_ml IS NOT NULL), '{}') AS volumes
    FROM products p
    JOIN product_categories c ON c.id = p.category_id
    LEFT JOIN product_variants v ON v.product_id = p.id
    WHERE p.is_active AND c.slug <> ALL(${HIDDEN_CATEGORIES}) AND p.slug NOT LIKE '%set%'
    GROUP BY p.id, p.slug, p.name, c.slug, c.name, c.sort_order, p.sort_order
    ORDER BY c.sort_order, p.sort_order, p.name`);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    categorySlug: String(r.category_slug),
    categoryName: String(r.category_name),
    volumes: (r.volumes as number[]).map(Number).filter((v) => [3000, 650, 500].includes(v)),
  }));
}

export type BatchLine = { id: string; volumeMl: number; label: string; quantity: number; bestBefore: string | null; soldOut: boolean };
export type Batch = {
  id: string;
  code: string;
  productId: string;
  productName: string;
  categorySlug: string;
  producedOn: string;
  note: string | null;
  createdByName: string | null;
  createdAt: Date;
  lines: BatchLine[];
};

export type CreateBatchResult =
  | { ok: true; created: boolean; batch: Batch; notified: boolean }
  | { ok: false; error: string };

type Actor = { userId: string | null; name: string | null; source: "web" | "agent"; sourceRef?: string | null };

async function loadBatches(where: ReturnType<typeof and> | undefined, limit: number): Promise<Batch[]> {
  const heads = await db
    .select({
      id: productionBatches.id,
      code: productionBatches.code,
      productId: productionBatches.productId,
      productName: productionBatches.productName,
      categorySlug: productCategories.slug,
      producedOn: productionBatches.producedOn,
      note: productionBatches.note,
      createdByName: productionBatches.createdByName,
      createdAt: productionBatches.createdAt,
    })
    .from(productionBatches)
    .innerJoin(products, eq(products.id, productionBatches.productId))
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(where)
    .orderBy(desc(productionBatches.producedOn), desc(productionBatches.createdAt))
    .limit(limit);
  if (heads.length === 0) return [];
  // explicitní sloupce: sold_out_auto přidává až skript 142 (do té doby by select() spadl)
  const lines = await db
    .select({
      id: productionBatchLines.id,
      batchId: productionBatchLines.batchId,
      volumeMl: productionBatchLines.volumeMl,
      quantity: productionBatchLines.quantity,
      bestBefore: productionBatchLines.bestBefore,
      soldOutAt: productionBatchLines.soldOutAt,
    })
    .from(productionBatchLines)
    .where(inArray(productionBatchLines.batchId, heads.map((h) => h.id)))
    .orderBy(desc(productionBatchLines.volumeMl));
  return heads.map((h) => ({
    ...h,
    lines: lines
      .filter((l) => l.batchId === h.id)
      .map((l) => ({
        id: l.id,
        volumeMl: l.volumeMl,
        label: VOLUME_LABELS[l.volumeMl as BatchVolume] ?? `${l.volumeMl} ml`,
        quantity: l.quantity,
        bestBefore: l.bestBefore,
        soldOut: Boolean(l.soldOutAt),
      })),
  }));
}

export async function listBatches(limit = 100): Promise<Batch[]> {
  await requireOrderContext();
  return loadBatches(isNull(productionBatches.cancelledAt), limit);
}

/** Řádky šarží, které ještě nejsou vyprodané a končí do `days` dní (i prošlé). */
export function expiringLines(batches: Batch[], today: string, days = 3): Array<{ batch: Batch; line: BatchLine; daysLeft: number }> {
  const out: Array<{ batch: Batch; line: BatchLine; daysLeft: number }> = [];
  for (const batch of batches)
    for (const line of batch.lines)
      if (!line.soldOut && line.bestBefore) {
        const left = daysUntil(line.bestBefore, today);
        if (left <= days) out.push({ batch, line, daysLeft: left });
      }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export async function createBatch(input: BatchInput, actor: Actor): Promise<CreateBatchResult> {
  if (actor.sourceRef) {
    const [existing] = await db
      .select({ id: productionBatches.id })
      .from(productionBatches)
      .where(and(eq(productionBatches.source, actor.source), eq(productionBatches.sourceRef, actor.sourceRef)))
      .limit(1);
    if (existing) {
      const [batch] = await loadBatches(eq(productionBatches.id, existing.id), 1);
      return { ok: true, created: false, batch, notified: false };
    }
  }
  const [product] = await db
    .select({ id: products.id, slug: products.slug, name: products.name, categorySlug: productCategories.slug })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(and(eq(products.id, input.productId), notInArray(productCategories.slug, HIDDEN_CATEGORIES)))
    .limit(1);
  if (!product) return { ok: false, error: "Produkt nebyl nalezen." };

  const base = batchCode(product.categorySlug, product.slug, input.producedOn);
  const taken = await db.select({ code: productionBatches.code }).from(productionBatches).where(like(productionBatches.code, `${base}%`));
  let seq = 1;
  while (taken.some((t) => t.code === batchCode(product.categorySlug, product.slug, input.producedOn, seq))) seq += 1;
  const code = batchCode(product.categorySlug, product.slug, input.producedOn, seq);

  const lines = input.lines.map((l) => ({
    volumeMl: l.volumeMl,
    quantity: l.quantity,
    bestBefore: l.bestBefore ?? bestBefore(input.producedOn, product.categorySlug, l.volumeMl),
  }));

  const [head] = await db
    .insert(productionBatches)
    .values({
      code,
      productId: product.id,
      productName: product.name,
      producedOn: input.producedOn,
      note: input.note ?? null,
      source: actor.source,
      sourceRef: actor.sourceRef ?? null,
      createdByUserId: actor.userId,
      createdByName: actor.name,
    })
    .returning({ id: productionBatches.id });
  try {
    // raw SQL: drizzle by vložil i sloupec sold_out_auto, který přidává až skript 142
    for (const l of lines) {
      await db.execute(sql`INSERT INTO production_batch_lines (batch_id, volume_ml, quantity, best_before) VALUES (${head.id}::uuid, ${l.volumeMl}, ${l.quantity}, ${l.bestBefore})`);
    }
  } catch (error) {
    await db.delete(productionBatches).where(eq(productionBatches.id, head.id));
    throw error;
  }
  const [batch] = await loadBatches(eq(productionBatches.id, head.id), 1);
  const notified = await notifyNewBatch(batch);
  return { ok: true, created: true, batch, notified };
}

export async function createBatchFromWeb(input: BatchInput): Promise<CreateBatchResult> {
  const ctx = await requireOrderContext();
  if (!(await batchesTableExists())) return { ok: false, error: NO_BATCH_TABLE };
  return createBatch(input, { userId: ctx.userId, name: ctx.name ?? ctx.email ?? null, source: "web" });
}

export async function setLineSoldOut(lineId: string, soldOut: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOrderContext();
  await db.update(productionBatchLines).set({ soldOutAt: soldOut ? new Date() : null }).where(eq(productionBatchLines.id, lineId));
  return { ok: true };
}

export async function cancelBatch(batchId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOrderContext();
  await db.update(productionBatches).set({ cancelledAt: new Date() }).where(and(eq(productionBatches.id, batchId), isNull(productionBatches.cancelledAt)));
  return { ok: true };
}

export function batchSummaryText(batch: Batch): string {
  const lines = batch.lines.map((l) => `- ${l.label}: ${l.quantity} ks, spotřebujte do ${formatCzDate(l.bestBefore)}`).join("\n");
  return `${batch.productName} – šarže ${batch.code}\nVyrobeno: ${formatCzDate(batch.producedOn)}${batch.createdByName ? ` (zapsal/a ${batch.createdByName})` : ""}\n${lines}${batch.note ? `\nPoznámka: ${batch.note}` : ""}`;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function notifyNewBatch(batch: Batch): Promise<boolean> {
  const config = emailConfig();
  if (!config) return false;
  const internal = resolveRecipients(config.internalTo, config);
  if (internal.to.length === 0) return false;
  const total = batch.lines.reduce((s, l) => s + l.quantity, 0);
  const text = `Nová šarže.\n\n${batchSummaryText(batch)}\n\nVšechny šarže: https://moje.begina.cz/rizeni-firmy/vyroba/sarze`;
  const key = createHash("sha256").update(`sarze|${batch.id}`).digest("hex").slice(0, 40);
  const sent = await resendTransport(config.apiKey)(
    {
      from: config.from,
      to: internal.to,
      subject: `Nová šarže: ${batch.productName} – ${total} ks (${batch.code})`,
      text,
      html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
    },
    `sarze-${key}`
  );
  if (!sent.ok) console.error("Šarže: upozornění se nepodařilo odeslat", sent.error.slice(0, 200));
  return sent.ok;
}

export { todayPrague };

import "server-only";

// Hodnocení produktů — čtení a zápis v DB (viz reviews.ts). Všechno čtení
// je odolné vůči chybějícím tabulkám (skript 126 ještě neproběhl): e-shop
// pak běží dál bez hodnocení.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loadPartnerOptOuts, addPartnerOptOut } from "./partnerMonthlyServer";
import { REVIEW_REQUESTS_ORDERS_FROM, REVIEW_REQUEST_AFTER_DAYS, REVIEW_REQUEST_MAX_AGE_DAYS, type ReviewInput } from "./reviews";
import { summarize, type ReviewSummary } from "./reviewsFormat";

type Row = Record<string, unknown>;
const rowsOf = (result: { rows?: unknown[] }) => (result.rows ?? []) as Row[];

async function reviewsReady(): Promise<boolean> {
  try {
    const exists = await db.execute(sql`SELECT to_regclass('public.product_reviews') IS NOT NULL AS present`);
    return rowsOf(exists)[0]?.present === true;
  } catch {
    return false;
  }
}

/** Průměr a počet hodnocení podle slugu produktu (pro kartičky i detail). */
export async function loadReviewSummaries(): Promise<Map<string, ReviewSummary>> {
  const map = new Map<string, ReviewSummary>();
  try {
    if (!(await reviewsReady())) return map;
    const result = await db.execute(sql`
      SELECT p.slug, array_agg(r.rating) AS ratings
      FROM product_reviews r JOIN products p ON p.id = r.product_id
      GROUP BY p.slug
    `);
    for (const row of rowsOf(result)) {
      const summary = summarize((row.ratings as number[]).map(Number));
      if (summary) map.set(String(row.slug), summary);
    }
  } catch (error) {
    console.error("Hodnocení: souhrn se nepodařilo načíst", String(error).slice(0, 200));
  }
  return map;
}

export type PublicReview = { id: string; rating: number; body: string; authorName: string; createdAt: string };

/** Všechna hodnocení produktu, nejnovější první (nic se neskrývá). */
export async function loadProductReviews(slug: string): Promise<PublicReview[]> {
  try {
    if (!(await reviewsReady())) return [];
    const result = await db.execute(sql`
      SELECT r.id, r.rating, r.body, r.author_name, to_char(r.created_at AT TIME ZONE 'Europe/Prague', 'FMDD. FMMM. YYYY') AS created
      FROM product_reviews r JOIN products p ON p.id = r.product_id
      WHERE p.slug = ${slug}
      ORDER BY r.created_at DESC
    `);
    return rowsOf(result).map((row) => ({
      id: String(row.id),
      rating: Number(row.rating),
      body: String(row.body ?? ""),
      authorName: String(row.author_name),
      createdAt: String(row.created),
    }));
  } catch (error) {
    console.error("Hodnocení: recenze se nepodařilo načíst", String(error).slice(0, 200));
    return [];
  }
}

export type ReviewFormProduct = {
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  existing: { rating: number; body: string } | null;
};
export type ReviewFormData = { orderId: string; customerName: string | null; products: ReviewFormProduct[] };

/**
 * Produkty objednávky, které smí zákazník hodnotit: jen objednávka z e-shopu,
 * která není stornovaná, a jen produkty z jejích položek. null = objednávka
 * neexistuje nebo k hodnocení není.
 */
export async function loadReviewForm(orderId: string): Promise<ReviewFormData | null> {
  if (!(await reviewsReady())) return null;
  const order = rowsOf(
    await db.execute(sql`
      SELECT id, COALESCE(billing_name, contact_name, recipient_name) AS customer_name
      FROM orders WHERE id = ${orderId}::uuid AND channel = 'eshop' AND fulfillment_status <> 'cancelled'
    `)
  )[0];
  if (!order) return null;
  const products = rowsOf(
    await db.execute(sql`
      SELECT DISTINCT ON (p.id) p.id, p.slug, p.name, p.sort_order,
             (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image,
             r.rating, r.body
      FROM order_items oi
      JOIN product_variants v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN product_reviews r ON r.product_id = p.id AND r.order_id = oi.order_id
      WHERE oi.order_id = ${orderId}::uuid AND c.slug <> 'doplnky'
      ORDER BY p.id
    `)
  );
  return {
    orderId,
    customerName: (order.customer_name as string | null) ?? null,
    products: products
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map((row) => ({
        productId: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        image: (row.image as string | null) ?? null,
        existing: row.rating === null || row.rating === undefined ? null : { rating: Number(row.rating), body: String(row.body ?? "") },
      })),
  };
}

/** Uloží nová hodnocení; už ohodnocený produkt se nepřepisuje. Vrací počet uložených. */
export async function saveReviews(form: ReviewFormData, authorName: string, inputs: ReviewInput[]): Promise<number> {
  const allowed = new Set(form.products.filter((product) => !product.existing).map((product) => product.productId));
  let saved = 0;
  for (const input of inputs) {
    if (!allowed.has(input.productId)) continue;
    const result = await db.execute(sql`
      INSERT INTO product_reviews (product_id, order_id, rating, body, author_name)
      VALUES (${input.productId}::uuid, ${form.orderId}::uuid, ${input.rating}, ${input.body}, ${authorName})
      ON CONFLICT (order_id, product_id) DO NOTHING
      RETURNING id
    `);
    saved += rowsOf(result).length;
  }
  return saved;
}

export type DueReviewRequest = { orderId: string; email: string; customerName: string | null };

/**
 * Objednávky z e-shopu doručené před 7–30 dny, kterým žádost ještě neodešla,
 * mají e-mail, ten není odhlášený a je co hodnotit. Doručení = první přechod
 * do stavu „delivered“ v historii objednávky.
 */
export async function dueReviewRequests(): Promise<DueReviewRequest[]> {
  if (!(await reviewsReady())) return [];
  const result = await db.execute(sql`
    SELECT o.id, lower(trim(o.contact_email)) AS email, COALESCE(o.billing_name, o.contact_name, o.recipient_name) AS customer_name
    FROM orders o
    JOIN LATERAL (
      SELECT min(a.created_at) AS at FROM order_activity a
      WHERE a.order_id = o.id AND a.kind = 'fulfillment_status_changed' AND a.metadata->>'to' = 'delivered'
    ) d ON d.at IS NOT NULL
    WHERE o.channel = 'eshop' AND o.fulfillment_status = 'delivered' AND o.contact_email IS NOT NULL
      AND o.created_at >= ${REVIEW_REQUESTS_ORDERS_FROM}::timestamptz
      AND d.at <= now() - make_interval(days => ${REVIEW_REQUEST_AFTER_DAYS})
      AND d.at >= now() - make_interval(days => ${REVIEW_REQUEST_MAX_AGE_DAYS})
      AND NOT EXISTS (SELECT 1 FROM review_requests q WHERE q.order_id = o.id)
      AND NOT EXISTS (SELECT 1 FROM email_optouts x WHERE x.email = lower(trim(o.contact_email)))
      AND EXISTS (
        SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.product_variant_id
        JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id
        WHERE oi.order_id = o.id AND c.slug <> 'doplnky'
          AND NOT EXISTS (SELECT 1 FROM product_reviews r WHERE r.order_id = o.id AND r.product_id = p.id)
      )
    ORDER BY d.at
    LIMIT 50
  `);
  // odhlášení v pokladně („Nepřeji si dostávat…“) platí i pro žádosti o hodnocení
  const refused = new Set(await loadPartnerOptOuts(db));
  return rowsOf(result)
    .map((row) => ({ orderId: String(row.id), email: String(row.email), customerName: (row.customer_name as string | null) ?? null }))
    .filter((row) => !refused.has(row.email));
}

/** Zabere žádost pro objednávku; false = už ji zabral jiný běh (e-mail jen jednou). */
export async function claimReviewRequest(orderId: string): Promise<boolean> {
  const result = await db.execute(sql`INSERT INTO review_requests (order_id) VALUES (${orderId}::uuid) ON CONFLICT (order_id) DO NOTHING RETURNING order_id`);
  return rowsOf(result).length === 1;
}

/** Odeslání selhalo → uvolnit, další běh to zkusí znovu. */
export async function releaseReviewRequest(orderId: string): Promise<void> {
  await db.execute(sql`DELETE FROM review_requests WHERE order_id = ${orderId}::uuid`);
}

export async function addEmailOptout(email: string): Promise<void> {
  await db.execute(sql`INSERT INTO email_optouts (email) VALUES (${email.trim().toLowerCase()}) ON CONFLICT (email) DO NOTHING`);
  // jedno odhlášení pro všechna obchodní sdělení (i partnerský program)
  await addPartnerOptOut(db, email);
}

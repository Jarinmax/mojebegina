// E-shop — načtení slevových kupónů a jejich dosavadního použití z DB
// (tabulka eshop_coupons, migrace 0028). Bez tabulky (migrace ještě
// neproběhla) e-shop funguje dál a žádný kód neplatí.
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import type { Coupon, CouponDiscountType, CouponUsage } from "./coupons";
import type { CouponContext } from "./checkout";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const { eshopCoupons, orderActivity, orders } = schema;

/** Postgres „undefined_table“ (i zabalený v DrizzleQueryError.cause). */
function isMissingTable(error: unknown): boolean {
  for (let e = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "42P01") return true;
  }
  return false;
}

export async function loadCouponContext<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof schema> | Db,
  codes: string[],
  now: Date = new Date()
): Promise<CouponContext> {
  const coupons = new Map<string, Coupon>();
  const usage = new Map<string, CouponUsage>();
  if (codes.length === 0) return { coupons, usage, now };

  let rows: (typeof eshopCoupons.$inferSelect)[];
  try {
    rows = await db
      .select()
      .from(eshopCoupons)
      .where(and(inArray(eshopCoupons.code, codes), eq(eshopCoupons.isActive, true)));
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    console.warn("E-shop: tabulka eshop_coupons chybí (migrace 0028) — slevové kódy zatím neplatí.");
    return { coupons, usage, now };
  }

  for (const row of rows) {
    coupons.set(row.code, {
      code: row.code,
      discountType: row.discountType as CouponDiscountType,
      amount: Number(row.amount),
      freeShipping: row.freeShipping,
      expiresAt: row.expiresAt,
      minimumAmountKc: row.minimumAmountKc,
      maximumAmountKc: row.maximumAmountKc,
      individualUse: row.individualUse,
      productSlugs: row.productSlugs,
      excludedProductSlugs: row.excludedProductSlugs,
      categorySlugs: row.categorySlugs,
      excludedCategorySlugs: row.excludedCategorySlugs,
      emailRestrictions: row.emailRestrictions.map((e) => e.toLowerCase()),
      usageLimit: row.usageLimit,
      usageLimitPerUser: row.usageLimitPerUser,
      limitUsageToXItems: row.limitUsageToXItems,
    });
    const byEmail = new Map<string, number>();
    for (const email of row.usedByBefore) {
      const key = email.trim().toLowerCase();
      byEmail.set(key, (byEmail.get(key) ?? 0) + 1);
    }
    usage.set(row.code, { total: row.usedBefore, byEmail });
  }
  if (coupons.size === 0) return { coupons, usage, now };

  // Použití v novém e-shopu: objednávky, které kód uplatnily (metadata
  // „created“ → coupons: [{code, discountKc}]), kromě zrušených.
  const used = await db
    .select({ metadata: orderActivity.metadata, email: orders.contactEmail })
    .from(orderActivity)
    .innerJoin(orders, eq(orders.id, orderActivity.orderId))
    .where(
      and(
        eq(orderActivity.kind, "created"),
        ne(orders.fulfillmentStatus, "cancelled"),
        sql`jsonb_typeof(${orderActivity.metadata} -> 'coupons') = 'array'`
      )
    );
  for (const row of used) {
    const list = (row.metadata as { coupons?: unknown } | null)?.coupons;
    if (!Array.isArray(list)) continue;
    const codesInOrder = new Set(
      list.flatMap((item) => (item && typeof item === "object" && typeof (item as { code?: unknown }).code === "string" ? [(item as { code: string }).code] : []))
    );
    for (const code of codesInOrder) {
      const entry = usage.get(code);
      if (!entry) continue;
      entry.total += 1;
      if (row.email) {
        const key = row.email.trim().toLowerCase();
        entry.byEmail.set(key, (entry.byEmail.get(key) ?? 0) + 1);
      }
    }
  }
  return { coupons, usage, now };
}

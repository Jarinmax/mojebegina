// E-shop — načtení slevových kupónů a jejich dosavadního použití z DB
// (tabulka eshop_coupons, migrace 0028). Bez tabulky (migrace ještě
// neproběhla) e-shop funguje dál a žádný kód neplatí.
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import type { Coupon, CouponDiscountType, CouponUsage } from "./coupons";
import type { CouponContext } from "./checkout";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const { eshopCoupons, invoices, orderActivity, orders, organizations } = schema;

/** Vydané faktury partnera z iDokladu (jako historie v Moje Begina): měsíc, stav, hodnota zboží. */
export type PartnerInvoice = { invoiceNumber: string; monthKey: string; paid: boolean; goodsKc: number };
export type PartnerInvoiceLoader = (ico: string) => Promise<PartnerInvoice[]>;

/** Výchozí zdroj: iDoklad (cache 5 min). Chyba iDokladu = počítají se jen objednávky v MojeBegina. */
const idokladInvoices: PartnerInvoiceLoader = async (ico) => {
  const { getIdokladPurchaseHistory } = await import("@/lib/data/idokladPurchaseHistory");
  const history = await getIdokladPurchaseHistory(ico);
  return history.map((order) => ({
    invoiceNumber: order.orderNumber.replace(/^Faktura č\. /, ""),
    monthKey: order.monthKey,
    paid: order.status === "Uhrazeno" || order.status === "Přeplaceno",
    goodsKc: order.goodsKc ?? order.totalKc,
  }));
};

/** „RRRR-MM“ měsíce v Praze, ve kterém leží okamžik. */
function pragueMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

/** Začátek kalendářního měsíce v Praze jako okamžik (offset = 0 → tento měsíc, −1 → minulý). */
export function pragueMonthStart(now: Date, offset: number): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value) - 1 + offset;
  // půlnoc v Praze = 23:00 nebo 22:00 UTC předchozího dne; zjistí se z offsetu té půlnoci
  const utcMidnight = new Date(Date.UTC(year, month, 1));
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hourCycle: "h23" }).format(utcMidnight)
  );
  return new Date(utcMidnight.getTime() - hour * 3600_000);
}

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
  now: Date = new Date(),
  options: { partnerInvoices?: PartnerInvoiceLoader } = {}
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
      ...(row.discountType === "partner" ? { partnerLastMonthKc: 0, partnerName: null } : {}),
    });
    const byEmail = new Map<string, number>();
    for (const email of row.usedByBefore) {
      const key = email.trim().toLowerCase();
      byEmail.set(key, (byEmail.get(key) ?? 0) + 1);
    }
    usage.set(row.code, { total: row.usedBefore, byEmail });
  }
  if (coupons.size === 0) return { coupons, usage, now };

  // Partnerské kódy: úroveň podle uhrazených nákupů zboží (bez dopravy, po
  // slevě) za minulý kalendářní měsíc — objednávky partnera (buyer
  // organizace) a e-shopové objednávky s některým jeho kódem.
  const partnerRows = rows.filter((row) => row.discountType === "partner" && row.organizationId);
  if (partnerRows.length > 0) {
    const orgIds = [...new Set(partnerRows.map((row) => row.organizationId!))];
    const allPartnerCodes = await db
      .select({ code: eshopCoupons.code, organizationId: eshopCoupons.organizationId })
      .from(eshopCoupons)
      .where(and(eq(eshopCoupons.discountType, "partner"), inArray(eshopCoupons.organizationId, orgIds)));
    const orgOfCode = new Map(allPartnerCodes.map((c) => [c.code, c.organizationId!]));
    const from = pragueMonthStart(now, -1);
    const to = pragueMonthStart(now, 0);
    const paid = await db
      .select({
        organizationId: orders.buyerOrganizationId,
        goodsKc: sql<number>`(${orders.subtotalKc} - ${orders.discountKc})::int`,
        metadata: orderActivity.metadata,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(orders)
      .leftJoin(orderActivity, and(eq(orderActivity.orderId, orders.id), eq(orderActivity.kind, "created")))
      .leftJoin(invoices, eq(invoices.orderId, orders.id))
      .where(
        and(
          eq(orders.paymentStatus, "paid"),
          ne(orders.fulfillmentStatus, "cancelled"),
          gte(orders.orderedAt, from),
          lt(orders.orderedAt, to)
        )
      );
    const totals = new Map<string, number>();
    const localInvoiceNumbers = new Set<string>();
    paid.forEach((row) => {
      let org = row.organizationId && orgIds.includes(row.organizationId) ? row.organizationId : null;
      if (!org) {
        const list = (row.metadata as { coupons?: { code?: unknown }[] } | null)?.coupons;
        const hit = Array.isArray(list) ? list.find((c) => typeof c?.code === "string" && orgOfCode.has(c.code)) : undefined;
        if (hit) org = orgOfCode.get(hit.code as string) ?? null;
      }
      if (!org) return;
      if (row.invoiceNumber) localInvoiceNumbers.add(row.invoiceNumber);
      totals.set(org, (totals.get(org) ?? 0) + Number(row.goodsKc));
    });
    const names = await db
      .select({ id: organizations.id, name: organizations.name, ico: organizations.ico })
      .from(organizations)
      .where(inArray(organizations.id, orgIds));
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    // Faktury v iDokladu (B2B nákupy mimo e-shop) — stejný zdroj jako
    // historie nákupů v Moje Begina; faktura k objednávce výše se nepočítá
    // dvakrát.
    const monthKey = pragueMonthKey(from);
    const loadInvoices = options.partnerInvoices ?? idokladInvoices;
    for (const org of names) {
      try {
        for (const invoice of await loadInvoices(org.ico)) {
          if (invoice.monthKey !== monthKey || !invoice.paid || localInvoiceNumbers.has(invoice.invoiceNumber)) continue;
          totals.set(org.id, (totals.get(org.id) ?? 0) + invoice.goodsKc);
        }
      } catch (error) {
        console.error("Kupóny: faktury partnera z iDokladu se nepodařilo načíst", org.id, error instanceof Error ? error.message.slice(0, 200) : error);
      }
    }
    for (const row of partnerRows) {
      const coupon = coupons.get(row.code);
      if (!coupon) continue;
      coupon.partnerLastMonthKc = totals.get(row.organizationId!) ?? 0;
      coupon.partnerName = nameOf.get(row.organizationId!) ?? null;
    }
  }

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

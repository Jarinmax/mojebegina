// E-shop — načtení slevových kupónů a jejich dosavadního použití z DB
// (tabulka eshop_coupons, migrace 0028). Bez tabulky (migrace ještě
// neproběhla) e-shop funguje dál a žádný kód neplatí.
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { PARTNER_CODE, type Coupon, type CouponDiscountType, type CouponUsage } from "./coupons";
import type { CouponContext } from "./checkout";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const { eshopCoupons, invoiceCustomers, invoices, orderActivity, orders, organizationMemberships, organizations, userProfiles } = schema;

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
  options: { partnerInvoices?: PartnerInvoiceLoader; email?: string | null } = {}
): Promise<CouponContext> {
  const coupons = new Map<string, Coupon>();
  const usage = new Map<string, CouponUsage>();
  if (codes.length === 0) return { coupons, usage, now };

  // Automatická partnerská sleva podle e-mailu (bez řádku v eshop_coupons).
  // Spočítá se jednou a použije i pro kupony ze starého e-shopu (níže).
  let partnerByEmail: Coupon | null | undefined;
  const partnerForEmail = async () => {
    if (partnerByEmail === undefined) {
      partnerByEmail = options.email
        ? await emailPartnerCoupon(db, options.email, now, options.partnerInvoices ?? idokladInvoices)
        : null;
    }
    return partnerByEmail;
  };
  if (codes.includes(PARTNER_CODE) && options.email) {
    const partner = await partnerForEmail();
    if (partner) {
      coupons.set(PARTNER_CODE, partner);
      usage.set(PARTNER_CODE, { total: 0, byEmail: new Map() });
    }
  }
  const requested = codes;
  codes = codes.filter((code) => code !== PARTNER_CODE);
  if (codes.length === 0) return { coupons, usage, now };

  // Kupony ze starého e-shopu (WooCommerce) nový e-shop nezná. Byly to
  // kupony partnerského programu — proto se neznámý kupon ověří podle
  // e-mailu: má-li zákazník za minulý měsíc partnerskou úroveň, dostane
  // slevu podle ní (stejnou, jakou mu kupon dával). Volá se na konci.
  const resolveLegacy = async () => {
    if (!options.email) return;
    for (const code of requested) {
      if (code === PARTNER_CODE || coupons.has(code)) continue;
      const partner = await partnerForEmail();
      if (!partner) return;
      coupons.set(code, { ...partner, code, legacy: true });
      usage.set(code, { total: 0, byEmail: new Map() });
    }
  };

  let rows: (typeof eshopCoupons.$inferSelect)[];
  try {
    rows = await db
      .select()
      .from(eshopCoupons)
      .where(and(inArray(eshopCoupons.code, codes), eq(eshopCoupons.isActive, true)));
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    console.warn("E-shop: tabulka eshop_coupons chybí (migrace 0028) — slevové kódy zatím neplatí.");
    await resolveLegacy();
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
  if (rows.length === 0) {
    await resolveLegacy();
    return { coupons, usage, now };
  }

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
  await resolveLegacy();
  return { coupons, usage, now };
}

/**
 * Partnerská úroveň zákazníka podle e-mailu: uhrazené nákupy zboží (bez
 * dopravy, po slevě) za minulý kalendářní měsíc —
 *   • objednávky s tímto kontaktním e-mailem,
 *   • objednávky a faktury z iDokladu organizací, ke kterým e-mail patří
 *     (člen v Moje Begina nebo fakturační kontakt firmy).
 * Faktura k objednávce se nepočítá dvakrát. null = e-mail nezná žádný nákup.
 */
async function emailPartnerCoupon<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof schema> | Db,
  rawEmail: string,
  now: Date,
  loadInvoices: PartnerInvoiceLoader
): Promise<Coupon | null> {
  const email = rawEmail.trim().toLowerCase();
  const [members, billing] = await Promise.all([
    db
      .select({ organizationId: organizationMemberships.organizationId })
      .from(userProfiles)
      .innerJoin(organizationMemberships, eq(organizationMemberships.userId, userProfiles.userId))
      .where(sql`lower(${userProfiles.email}) = ${email}`),
    db
      .select({ organizationId: invoiceCustomers.organizationId, ico: invoiceCustomers.ico })
      .from(invoiceCustomers)
      .where(and(eq(invoiceCustomers.kind, "company"), eq(invoiceCustomers.emailNormalized, email))),
  ]);
  const orgIds = [...new Set([...members.map((m) => m.organizationId), ...billing.flatMap((b) => (b.organizationId ? [b.organizationId] : []))])];
  const orgs = orgIds.length
    ? await db.select({ id: organizations.id, ico: organizations.ico, name: organizations.name }).from(organizations).where(inArray(organizations.id, orgIds))
    : [];
  const icos = [...new Set([...orgs.map((o) => o.ico), ...billing.flatMap((b) => (b.ico ? [b.ico] : []))])];

  const from = pragueMonthStart(now, -1);
  const to = pragueMonthStart(now, 0);
  const local = await db
    .select({
      id: orders.id,
      goodsKc: sql<number>`(${orders.subtotalKc} - ${orders.discountKc})::int`,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(orders)
    .leftJoin(invoices, eq(invoices.orderId, orders.id))
    .where(
      and(
        eq(orders.paymentStatus, "paid"),
        ne(orders.fulfillmentStatus, "cancelled"),
        gte(orders.orderedAt, from),
        lt(orders.orderedAt, to),
        orgIds.length
          ? sql`(lower(${orders.contactEmail}) = ${email} OR ${inArray(orders.buyerOrganizationId, orgIds)})`
          : sql`lower(${orders.contactEmail}) = ${email}`
      )
    );
  const seenOrders = new Set<string>();
  const counted = new Set<string>();
  let total = 0;
  for (const row of local) {
    if (seenOrders.has(row.id)) continue;
    seenOrders.add(row.id);
    if (row.invoiceNumber) counted.add(row.invoiceNumber);
    total += Number(row.goodsKc);
  }
  const monthKey = pragueMonthKey(from);
  for (const ico of icos) {
    try {
      for (const invoice of await loadInvoices(ico)) {
        if (invoice.monthKey !== monthKey || !invoice.paid || counted.has(invoice.invoiceNumber)) continue;
        counted.add(invoice.invoiceNumber);
        total += invoice.goodsKc;
      }
    } catch (error) {
      console.error("Partnerská sleva: faktury z iDokladu se nepodařilo načíst", ico, error instanceof Error ? error.message.slice(0, 200) : error);
    }
  }
  if (seenOrders.size === 0 && counted.size === 0 && orgIds.length === 0) return null;

  // individuální úroveň (nad 20 000 Kč): sjednané procento z osobního kódu partnera
  let individual = 0;
  if (orgIds.length) {
    try {
      const rows = await db
        .select({ amount: eshopCoupons.amount })
        .from(eshopCoupons)
        .where(and(eq(eshopCoupons.discountType, "partner"), eq(eshopCoupons.isActive, true), inArray(eshopCoupons.organizationId, orgIds)));
      individual = Math.max(0, ...rows.map((r) => Number(r.amount)));
    } catch (error) {
      if (!isMissingTable(error)) throw error;
    }
  }

  return {
    code: PARTNER_CODE,
    discountType: "partner",
    amount: individual,
    freeShipping: false,
    expiresAt: null,
    minimumAmountKc: null,
    maximumAmountKc: null,
    individualUse: false,
    productSlugs: [],
    excludedProductSlugs: [],
    categorySlugs: [],
    excludedCategorySlugs: [],
    emailRestrictions: [],
    usageLimit: null,
    usageLimitPerUser: null,
    limitUsageToXItems: null,
    partnerLastMonthKc: total,
    partnerName: orgs[0]?.name ?? null,
  };
}

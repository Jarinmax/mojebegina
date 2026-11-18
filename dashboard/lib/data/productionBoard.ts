import "server-only";

import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderItems, orders, organizations, productCategories, products, productVariants } from "@/lib/db/schema";
import { addCzWorkdays } from "@/lib/czWorkdays";
import { displayItemName } from "@/lib/eshop/packageLabel";
import { requireOrderContext, updateFulfillmentStatus } from "./orders";

// Výroba pro Jarina (Lucie 18. 11. 2026): přehled všech ZAPLACENÝCH a ještě
// neodeslaných objednávek (jako tabulka „Objednávky výroba Jarda“) a karta
// jedné objednávky s doručovací adresou, termínem dodání (zaplacení + 5
// pracovních dnů) a zaškrtáváním vyrobených položek po skupinách.

export const DELIVERY_WORKDAYS = 5;

/** Skupiny produktů v pořadí a barvách výrobní tabulky. */
export const PRODUCTION_GROUPS = [
  { slug: "polevky", label: "Polévky" },
  { slug: "sirupy", label: "Sirupy" },
  { slug: "caje", label: "Čaje" },
  { slug: "ovocne-napoje", label: "Ovocné nápoje" },
  { slug: "koktejly", label: "Alkoholické koktejly" },
  { slug: "zmrzliny", label: "Zmrzliny" },
  { slug: "ostatni", label: "Ostatní" },
] as const;
export type ProductionGroupSlug = (typeof PRODUCTION_GROUPS)[number]["slug"];

const NOT_FOR_PRODUCTION = ["cancelled", "handed_to_carrier", "out_for_delivery", "delivered"] as const;

export type ProductionItem = {
  id: string;
  name: string;
  quantity: number;
  group: ProductionGroupSlug;
  producedAt: Date | null;
  producedByName: string | null;
};

export type ProductionOrder = {
  id: string;
  orderNumber: number | null;
  customer: string;
  contactName: string | null;
  deliveryName: string | null;
  deliveryAddress: string | null;
  deliveryPhone: string | null;
  email: string | null;
  shippingMethod: string | null;
  customerNote: string | null;
  paidAt: Date | null;
  deadline: Date | null;
  fulfillmentStatus: string;
  items: ProductionItem[];
  producedCount: number;
};

/** Ruční objednávky nemají vazbu na katalog — skupina se odhadne z názvu. */
function groupFromName(name: string): ProductionGroupSlug {
  const n = name.toLocaleLowerCase("cs");
  if (/pol[eé]vk|kulajd|gul[aá][šs]/.test(n)) return "polevky";
  if (/sirup/.test(n)) return "sirupy";
  if (/zmrzlin/.test(n)) return "zmrzliny";
  if (/čaj|caj\b/.test(n)) return "caje";
  if (/sva[řr][aá]k|koktejl|lady carneval|bond|kosmopolitan|deluxe/.test(n)) return "koktejly";
  if (/limon|n[aá]poj|milkshake|ledov/.test(n)) return "ovocne-napoje";
  return "ostatni";
}

function groupFromSlug(slug: string | null, name: string): ProductionGroupSlug {
  const known = PRODUCTION_GROUPS.find((g) => g.slug === slug);
  return known ? known.slug : groupFromName(name);
}

function customerName(row: {
  orgName: string | null;
  billingCompany: string | null;
  recipientCompany: string | null;
  contactName: string | null;
}): string {
  return (
    row.orgName?.trim() ||
    row.recipientCompany?.trim() ||
    row.billingCompany?.trim() ||
    row.contactName?.trim() ||
    "Zákazník bez jména"
  );
}

async function loadOrders(where: ReturnType<typeof and>): Promise<ProductionOrder[]> {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orgName: organizations.name,
      billingCompany: orders.billingCompany,
      recipientCompany: orders.recipientCompany,
      contactName: orders.contactName,
      contactPhone: orders.contactPhone,
      contactEmail: orders.contactEmail,
      recipientName: orders.recipientName,
      recipientAddress: orders.recipientAddress,
      recipientPhone: orders.recipientPhone,
      billingStreet: orders.billingStreet,
      billingZip: orders.billingZip,
      billingCity: orders.billingCity,
      billingCountry: orders.billingCountry,
      shippingMethodLabel: orders.shippingMethodLabel,
      customerNote: orders.customerNote,
      paidAt: orders.paidAt,
      orderedAt: orders.orderedAt,
      fulfillmentStatus: orders.fulfillmentStatus,
    })
    .from(orders)
    .leftJoin(organizations, eq(organizations.id, orders.buyerOrganizationId))
    .where(where)
    .orderBy(asc(orders.paidAt), asc(orders.orderedAt));
  if (rows.length === 0) return [];

  const itemRows = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      name: orderItems.name,
      quantity: orderItems.quantity,
      producedAt: orderItems.producedAt,
      producedByName: orderItems.producedByName,
      categorySlug: productCategories.slug,
      categorySort: productCategories.sortOrder,
      productSort: products.sortOrder,
    })
    .from(orderItems)
    .leftJoin(productVariants, eq(productVariants.id, orderItems.productVariantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)));

  const groupIndex = (g: ProductionGroupSlug) => PRODUCTION_GROUPS.findIndex((x) => x.slug === g);
  const byOrder = new Map<string, (ProductionItem & { sort: number })[]>();
  for (const it of itemRows) {
    const group = groupFromSlug(it.categorySlug, it.name);
    const list = byOrder.get(it.orderId) ?? [];
    list.push({
      id: it.id,
      name: displayItemName(it.name),
      quantity: it.quantity,
      group,
      producedAt: it.producedAt,
      producedByName: it.producedByName,
      sort: groupIndex(group) * 10_000 + (it.productSort ?? 9_999),
    });
    byOrder.set(it.orderId, list);
  }

  return rows.map((r) => {
    const items = (byOrder.get(r.id) ?? [])
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "cs"))
      .map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        group: item.group,
        producedAt: item.producedAt,
        producedByName: item.producedByName,
      }));
    const deliveryAddress =
      r.recipientAddress?.trim() ||
      [r.billingStreet, [r.billingZip, r.billingCity].filter(Boolean).join(" "), r.billingCountry && r.billingCountry !== "CZ" ? r.billingCountry : null]
        .filter(Boolean)
        .join(", ") ||
      null;
    return {
      id: r.id,
      orderNumber: r.orderNumber,
      customer: customerName(r),
      contactName: r.contactName,
      deliveryName: r.recipientName ?? r.contactName,
      deliveryAddress,
      deliveryPhone: r.recipientPhone ?? r.contactPhone,
      email: r.contactEmail,
      shippingMethod: r.shippingMethodLabel,
      customerNote: r.customerNote,
      paidAt: r.paidAt,
      deadline: r.paidAt ? addCzWorkdays(r.paidAt, DELIVERY_WORKDAYS) : null,
      fulfillmentStatus: r.fulfillmentStatus,
      items,
      producedCount: items.filter((i) => i.producedAt).length,
    };
  });
}

/** Zaplacené, ještě neodeslané objednávky — to, co má Jarin vyrobit. */
export async function listProductionOrders(): Promise<ProductionOrder[]> {
  await requireOrderContext();
  return loadOrders(
    and(
      eq(orders.paymentStatus, "paid"),
      notInArray(orders.fulfillmentStatus, [...NOT_FOR_PRODUCTION]),
      isNull(orders.shippedAt)
    )
  );
}

export async function getProductionOrder(orderId: string): Promise<ProductionOrder | null> {
  await requireOrderContext();
  const [order] = await loadOrders(and(eq(orders.id, orderId)));
  return order ?? null;
}

export type ProductionToggleResult = { ok: true } | { ok: false; error: string };

/**
 * Zaškrtnutí / vrácení vyrobené položky. Stav objednávky se dorovná sám:
 * první vyrobená položka → „V přípravě/výrobě“, všechny vyrobené →
 * „Připravená“; vrácení položky u Připravené → zpět „V přípravě/výrobě“.
 * Odeslané / doručené / stornované objednávky se nepřepínají.
 */
export async function setItemProduced(itemId: string, produced: boolean): Promise<ProductionToggleResult> {
  const ctx = await requireOrderContext();
  const [item] = await db
    .select({ id: orderItems.id, orderId: orderItems.orderId })
    .from(orderItems)
    .where(eq(orderItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Položka nebyla nalezena." };

  await db
    .update(orderItems)
    .set(produced ? { producedAt: new Date(), producedByName: ctx.name ?? ctx.email } : { producedAt: null, producedByName: null })
    .where(produced ? and(eq(orderItems.id, itemId), isNull(orderItems.producedAt)) : eq(orderItems.id, itemId));

  const [order] = await db
    .select({ status: orders.fulfillmentStatus })
    .from(orders)
    .where(eq(orders.id, item.orderId))
    .limit(1);
  const all = await db
    .select({ producedAt: orderItems.producedAt })
    .from(orderItems)
    .where(eq(orderItems.orderId, item.orderId));
  const done = all.filter((i) => i.producedAt).length;
  const status = order?.status ?? "";
  let next: string | null = null;
  if (done === all.length && all.length > 0 && ["new", "confirmed", "preparing"].includes(status)) next = "ready";
  else if (done > 0 && done < all.length && ["new", "confirmed", "ready"].includes(status)) next = "preparing";
  else if (done === 0 && status === "ready") next = "preparing";
  if (next) {
    const changed = await updateFulfillmentStatus(item.orderId, next, status);
    if (!changed.ok) return { ok: false, error: changed.error };
  }
  return { ok: true };
}

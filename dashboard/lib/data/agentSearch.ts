// GPT/MCP pilot — hledání pro search_mojebegina mimo CRM (to dělá
// leads.ts:searchCrm): objednávky, produkty, témata Živé mapy a CEO projekty.
// Každá doména volá svou bránu; hledaný text jde jen jako parametr ILIKE
// s escapovanými % a _ (likePattern).
import "server-only";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companyNodes, focusProjects, orders, organizations, products, productVariants } from "@/lib/db/schema";
import { requireOrderContext } from "./orders";
import { requireCompanyNodeContext } from "./companyNodes";
import { requireCeoFocusContext } from "./ceoFocus";
import { requireCrmContext } from "./leads";
import { likePattern } from "./leadValidation";

export const SEARCH_DOMAIN_LIMIT = 10;

export async function searchOrders(query: string) {
  await requireOrderContext();
  const pattern = likePattern(query);
  const digits = /^\d{1,12}$/.test(query) ? Number(query) : null;
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderedAt: orders.orderedAt,
      totalKc: orders.totalKc,
      paymentStatus: orders.paymentStatus,
      fulfillmentStatus: orders.fulfillmentStatus,
      channel: orders.channel,
      contactName: orders.contactName,
      customerName: organizations.name,
    })
    .from(orders)
    .leftJoin(organizations, eq(organizations.id, orders.buyerOrganizationId))
    .where(
      or(
        digits !== null ? eq(orders.orderNumber, digits) : undefined,
        eq(orders.paymentVs, query),
        ilike(orders.contactName, pattern),
        ilike(orders.contactEmail, pattern),
        ilike(orders.contactPhone, pattern),
        ilike(orders.recipientName, pattern),
        ilike(organizations.name, pattern)
      )
    )
    .orderBy(desc(orders.orderedAt))
    .limit(SEARCH_DOMAIN_LIMIT + 1);
  return rows;
}

export async function searchProducts(query: string) {
  // Katalog je veřejný (e-shop), přesto jen pro interní uživatele CRM.
  await requireCrmContext();
  const pattern = likePattern(query);
  return db
    .selectDistinct({ id: products.id, name: products.name, slug: products.slug, isActive: products.isActive })
    .from(products)
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .where(or(ilike(products.name, pattern), ilike(products.slug, pattern), ilike(productVariants.sku, pattern), ilike(productVariants.label, pattern)))
    .orderBy(asc(products.name))
    .limit(SEARCH_DOMAIN_LIMIT + 1);
}

export async function searchCompanyNodes(query: string) {
  await requireCompanyNodeContext();
  return db
    .select({ id: companyNodes.id, title: companyNodes.title, status: companyNodes.status, priority: companyNodes.priority })
    .from(companyNodes)
    .where(and(isNull(companyNodes.archivedAt), or(ilike(companyNodes.title, likePattern(query)), ilike(companyNodes.description, likePattern(query)))))
    .orderBy(asc(companyNodes.title))
    .limit(SEARCH_DOMAIN_LIMIT + 1);
}

export async function searchFocusProjects(query: string) {
  await requireCeoFocusContext();
  return db
    .select({ id: focusProjects.id, title: focusProjects.title, status: focusProjects.status, isActiveNow: focusProjects.isActiveNow })
    .from(focusProjects)
    .where(or(ilike(focusProjects.title, likePattern(query)), ilike(focusProjects.description, likePattern(query))))
    .orderBy(sql`${focusProjects.isActiveNow} DESC`, desc(focusProjects.updatedAt))
    .limit(SEARCH_DOMAIN_LIMIT + 1);
}

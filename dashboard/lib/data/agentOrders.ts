// MCP objednávky 1.1 (plánování rozvozů) — filtrovaný výpis objednávek pro
// asistenta se stránkováním. Stejná brána jako zbytek objednávek
// (requireOrderContext) a stejné karty jako lidská stránka Objednávky
// (buildOrderCards z orders.ts) — ne paralelní model dat, jen jiný filtr/
// řazení pro plánování tras. Samostatný soubor (ne orders.ts), stejný
// důvod jako agentLeads.ts: ať se nepříčí s rozpracovanými větvemi, které
// orders.ts mění.
import "server-only";
import { and, asc, count, eq, exists, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, organizations } from "@/lib/db/schema";
import { buildOrderCards, requireOrderContext, type OrderCardData } from "./orders";
import { likePattern } from "./leadValidation";
import { pragueDayStart, shiftDate, type CallActivityRange } from "./callActivityValidation";
import type { FulfillmentStatus, PaymentStatus } from "./orderValidation";

export type AgentOrderFilter = {
  /** volný text — jméno/e-mail/telefon kontaktu nebo název organizace */
  customer: string | null;
  orderNumber: number | null;
  fulfillmentStatuses: FulfillmentStatus[] | null;
  paymentStatuses: PaymentStatus[] | null;
  /** rozmezí plánovaného doručení (plánování tras na konkrétní den) */
  plannedDelivery: CallActivityRange | null;
  /** volný text proti orders.carrier (přepravce) */
  carrier: string | null;
};

function whereFor(filter: AgentOrderFilter): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (filter.customer !== null) {
    const pattern = likePattern(filter.customer);
    const orgNameMatches = exists(
      db
        .select({ one: sql`1` })
        .from(organizations)
        .where(and(eq(organizations.id, orders.buyerOrganizationId), ilike(organizations.name, pattern)))
    );
    parts.push(or(ilike(orders.contactName, pattern), ilike(orders.contactEmail, pattern), ilike(orders.contactPhone, pattern), orgNameMatches));
  }
  if (filter.orderNumber !== null) parts.push(eq(orders.orderNumber, filter.orderNumber));
  if (filter.fulfillmentStatuses !== null) parts.push(inArray(orders.fulfillmentStatus, filter.fulfillmentStatuses));
  if (filter.paymentStatuses !== null) parts.push(inArray(orders.paymentStatus, filter.paymentStatuses));
  if (filter.plannedDelivery !== null) {
    const from = pragueDayStart(filter.plannedDelivery.dateFrom);
    const to = pragueDayStart(shiftDate(filter.plannedDelivery.dateTo, 1));
    parts.push(and(gte(orders.plannedDeliveryAt, from), lt(orders.plannedDeliveryAt, to)));
  }
  if (filter.carrier !== null) parts.push(ilike(orders.carrier, likePattern(filter.carrier)));
  return parts.length > 0 ? and(...parts) : undefined;
}

export async function listOrdersForAgent(
  filter: AgentOrderFilter,
  page: { limit: number; offset: number }
): Promise<{ total: number; rows: OrderCardData[] }> {
  await requireOrderContext();
  const where = whereFor(filter);

  const [{ total }] = await db.select({ total: count() }).from(orders).where(where);

  // Plánování tras: nejdřív co má konkrétní termín doručení (nejbližší
  // první), pak zbytek od nejnovějšího — stejná výchozí logika jako lidská
  // stránka Objednávky, jen navíc řazeno podle termínu, když je zadaný.
  const order = filter.plannedDelivery
    ? [asc(orders.plannedDeliveryAt), asc(orders.id)]
    : [sql`${orders.plannedDeliveryAt} ASC NULLS LAST`, sql`${orders.orderedAt} DESC`, asc(orders.id)];

  const rows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(...order)
    .limit(page.limit)
    .offset(page.offset);

  return { total: Number(total), rows: await buildOrderCards(rows) };
}

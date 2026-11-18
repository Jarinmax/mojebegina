// Nákupy zákazníků pro Obchod (karta a seznam zákazníků) — objednávky
// z MojeBegina + faktury z iDokladu podle IČO, bez dvojího započtení
// (customerPurchasesMerge.ts). Volá se jen z lib/data/leads.ts po ověření
// přístupu (requireCrmContext / vlastník zákazníka).
import "server-only";
import { and, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, orders } from "@/lib/db/schema";
import { partnerTiers } from "@/mock/partnerProgram";
import { getIdokladPurchaseHistory } from "./idokladPurchaseHistory";
import {
  customerPartnerStatus,
  invoiceNumberFromLabel,
  mergeCustomerPurchases,
  parseCzechDate,
  type CustomerPartnerStatus,
  type CustomerPurchaseSummary,
  type PurchaseInvoiceInput,
  type PurchaseOrderInput,
} from "./customerPurchasesMerge";

export type CustomerPurchasesResult = CustomerPurchaseSummary & {
  /** false = faktury z iDokladu se teď nepodařilo načíst (ukazují se jen objednávky) */
  invoicesLoaded: boolean;
  partner: CustomerPartnerStatus;
};

type OrgRef = { id: string; ico: string };

const IDOKLAD_CONCURRENCY = 3;

async function loadOrders(orgIds: string[]) {
  if (orgIds.length === 0) return [];
  const orderRows = await db
    .select({
      id: orders.id,
      buyerOrganizationId: orders.buyerOrganizationId,
      orderNumber: orders.orderNumber,
      orderedAt: orders.orderedAt,
      paidAt: orders.paidAt,
      totalKc: orders.totalKc,
      subtotalKc: orders.subtotalKc,
      discountKc: orders.discountKc,
      channel: orders.channel,
      paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .where(and(inArray(orders.buyerOrganizationId, orgIds), ne(orders.fulfillmentStatus, "cancelled")));

  const orderIds = orderRows.map((o) => o.id);
  const invoiceRows = orderIds.length
    ? await db
        .select({ orderId: invoices.orderId, invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .where(inArray(invoices.orderId, orderIds))
    : [];
  const invoiceByOrder = new Map<string, string>();
  for (const row of invoiceRows) {
    if (row.invoiceNumber && !invoiceByOrder.has(row.orderId)) invoiceByOrder.set(row.orderId, row.invoiceNumber);
  }
  return orderRows.map((o) => ({ ...o, invoiceNumber: invoiceByOrder.get(o.id) ?? null }));
}

async function loadInvoices(ico: string): Promise<PurchaseInvoiceInput[] | null> {
  try {
    const history = await getIdokladPurchaseHistory(ico);
    return history.flatMap((inv) => {
      const issuedAt = parseCzechDate(inv.date);
      const number = invoiceNumberFromLabel(inv.orderNumber);
      if (!issuedAt || !number) return [];
      return [
        {
          number,
          issuedAt,
          totalKc: inv.totalKc,
          goodsKc: inv.goodsKc ?? inv.totalKc,
          paid: inv.status === "Uhrazeno" || inv.status === "Přeplaceno",
        },
      ];
    });
  } catch (error) {
    console.error(
      "Obchod: faktury z iDokladu se nepodařilo načíst:",
      error instanceof Error ? error.message.slice(0, 240) : "neznámá chyba"
    );
    return null;
  }
}

async function mapWithConcurrency<T, U>(values: T[], concurrency: number, mapper: (value: T) => Promise<U>): Promise<U[]> {
  const result = new Array<U>(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      result[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return result;
}

export async function loadCustomerPurchases(orgs: OrgRef[], now: Date = new Date()): Promise<Map<string, CustomerPurchasesResult>> {
  const orderRows = await loadOrders(orgs.map((o) => o.id));
  const invoiceLists = await mapWithConcurrency(orgs, IDOKLAD_CONCURRENCY, (org) => loadInvoices(org.ico));

  const result = new Map<string, CustomerPurchasesResult>();
  orgs.forEach((org, i) => {
    const own = orderRows.filter((o) => o.buyerOrganizationId === org.id);
    const orderInputs: PurchaseOrderInput[] = own.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber !== null ? String(o.orderNumber) : null,
      invoiceNumber: o.invoiceNumber,
      orderedAt: o.orderedAt,
      totalKc: o.totalKc,
      goodsKc: o.subtotalKc - o.discountKc,
      channel: o.channel,
    }));
    const invoiceList = invoiceLists[i];
    const summary = mergeCustomerPurchases(orderInputs, invoiceList ?? []);
    const eshopPaid = own
      .filter((o) => o.channel === "eshop" && o.paymentStatus === "paid")
      .map((o) => ({ paidAt: o.paidAt ?? o.orderedAt, goodsKc: o.subtotalKc - o.discountKc }));
    // Nárok má jen ten, kdo přes e-shop vůbec objednává (i když tento měsíc ještě ne).
    const everOrderedViaEshop = own.some((o) => o.channel === "eshop");
    result.set(org.id, {
      ...summary,
      invoicesLoaded: invoiceList !== null,
      partner: everOrderedViaEshop ? customerPartnerStatus(eshopPaid, partnerTiers, now) : { eligible: false },
    });
  });
  return result;
}

export async function loadCustomerPurchasesFor(org: OrgRef): Promise<CustomerPurchasesResult> {
  const map = await loadCustomerPurchases([org]);
  return map.get(org.id)!;
}


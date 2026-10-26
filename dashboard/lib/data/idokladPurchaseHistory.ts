import "server-only";

import { unstable_cache } from "next/cache";
import type { Order, OrderItem, OrderStatus } from "@/mock/customer";
import { IDOKLAD_ENUMS } from "@/lib/eshop/invoicing/idoklad";
import {
  EshopIdokladClient,
  eqFilter,
  issuedInvoiceFilter,
} from "@/lib/eshop/invoicing/idokladHttp";
import { eshopIdokladCredentials } from "@/lib/eshop/invoicing/mode";

type IdokladContact = {
  Id?: unknown;
  IdentificationNumber?: unknown;
};

type IdokladInvoiceItem = {
  Name?: unknown;
  Amount?: unknown;
  UnitPrice?: unknown;
  Prices?: {
    UnitPrice?: unknown;
    TotalWithVat?: unknown;
  } | null;
};

type IdokladInvoice = {
  Id?: unknown;
  DocumentNumber?: unknown;
  DateOfIssue?: unknown;
  PaymentStatus?: unknown;
  IsPaid?: unknown;
  Items?: unknown;
  Prices?: {
    TotalWithVat?: unknown;
  } | null;
};

const MAX_PAGES_PER_CONTACT = 10;
const DETAIL_CONCURRENCY = 6;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number > 0 ? number : null;
}

function dateParts(value: unknown): { date: string; monthKey: string; timestamp: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    date: `${Number(day)}. ${Number(month)}. ${year}`,
    monthKey: `${year}-${month}`,
    timestamp: Date.UTC(Number(year), Number(month) - 1, Number(day)),
  };
}

function paymentStatus(invoice: IdokladInvoice): OrderStatus {
  const value = invoice.PaymentStatus;
  if (value === IDOKLAD_ENUMS.PaymentStatus.Paid || value === "Paid" || value === "1" || invoice.IsPaid === true) {
    return "Uhrazeno";
  }
  if (value === IDOKLAD_ENUMS.PaymentStatus.PartialPaid || value === "PartialPaid" || value === "2") {
    return "Částečně uhrazeno";
  }
  if (value === IDOKLAD_ENUMS.PaymentStatus.Overpaid || value === "Overpaid" || value === "3") {
    return "Přeplaceno";
  }
  return "Neuhrazeno";
}

function invoiceItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];
  const result: OrderItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as IdokladInvoiceItem;
    if (typeof item.Name !== "string" || !item.Name.trim()) continue;
    const quantity = finiteNumber(item.Amount) ?? 1;
    const explicitUnitPrice = finiteNumber(item.UnitPrice) ?? finiteNumber(item.Prices?.UnitPrice);
    const total = finiteNumber(item.Prices?.TotalWithVat);
    const priceKc = explicitUnitPrice ?? (total !== null && quantity !== 0 ? total / quantity : 0);
    result.push({ name: item.Name.trim(), quantity, priceKc });
  }
  return result;
}

function toOrder(invoice: IdokladInvoice): (Order & { sortTimestamp: number }) | null {
  const id = positiveInteger(invoice.Id);
  const documentNumber =
    typeof invoice.DocumentNumber === "string" && invoice.DocumentNumber.trim()
      ? invoice.DocumentNumber.trim()
      : null;
  const parts = dateParts(invoice.DateOfIssue);
  const totalKc = finiteNumber(invoice.Prices?.TotalWithVat);
  if (id === null || documentNumber === null || parts === null || totalKc === null) return null;

  const items = invoiceItems(invoice.Items);
  const status = paymentStatus(invoice);
  return {
    id: `idoklad-${id}`,
    orderNumber: `Faktura č. ${documentNumber}`,
    date: parts.date,
    monthKey: parts.monthKey,
    items,
    products: items.length > 0 ? items.map((item) => `${item.quantity}× ${item.name}`).join(", ") : "Nákup dle faktury",
    totalKc,
    status,
    paymentHref: status === "Neuhrazeno" || status === "Částečně uhrazeno" ? `/faktury/${id}/zaplatit` : undefined,
    sortTimestamp: parts.timestamp,
  };
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>
): Promise<U[]> {
  const result = new Array<U>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      result[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return result;
}

export async function loadIdokladPurchaseHistory(
  ico: string,
  options: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<Order[]> {
  const env = options.env ?? process.env;
  const credentials = eshopIdokladCredentials(env);
  if (!credentials) return [];

  const client = new EshopIdokladClient({
    ...credentials,
    writesAllowed: false,
    env,
    fetchImpl: options.fetchImpl,
    requestBudget: 250,
  });
  const contacts = await client.list<IdokladContact>(
    "/Contacts",
    eqFilter("IdentificationNumber", ico),
    100
  );
  const normalizedIco = ico.replace(/\s/g, "");
  const contactIds = contacts.Items.flatMap((contact) => {
    const id = positiveInteger(contact.Id);
    const contactIco =
      typeof contact.IdentificationNumber === "string"
        ? contact.IdentificationNumber.replace(/\s/g, "")
        : "";
    return id !== null && contactIco === normalizedIco ? [id] : [];
  });

  const summaries: IdokladInvoice[] = [];
  for (const contactId of contactIds) {
    for (let page = 1; page <= MAX_PAGES_PER_CONTACT; page += 1) {
      const response = await client.list<IdokladInvoice>(
        "/IssuedInvoices",
        issuedInvoiceFilter(eqFilter("PartnerId", String(contactId))),
        100,
        page
      );
      summaries.push(...response.Items);
      if (page >= response.TotalPages || response.Items.length === 0) break;
      if (page === MAX_PAGES_PER_CONTACT) {
        throw new Error(`iDoklad: kontakt ${contactId} má více než ${MAX_PAGES_PER_CONTACT * 100} faktur.`);
      }
    }
  }

  const uniqueById = new Map<number, IdokladInvoice>();
  for (const invoice of summaries) {
    const id = positiveInteger(invoice.Id);
    if (id !== null) uniqueById.set(id, invoice);
  }

  const detailed = await mapWithConcurrency(
    [...uniqueById.entries()],
    DETAIL_CONCURRENCY,
    async ([id, summary]) => {
      if (Array.isArray(summary.Items)) return summary;
      return client.get<IdokladInvoice>(`/IssuedInvoices/${id}`);
    }
  );

  return detailed
    .map(toOrder)
    .filter((order): order is Order & { sortTimestamp: number } => order !== null)
    .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
    .map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      date: order.date,
      monthKey: order.monthKey,
      items: order.items,
      products: order.products,
      totalKc: order.totalKc,
      status: order.status,
      paymentHref: order.paymentHref,
    }));
}

// Historické faktury se mění jen při nové faktuře nebo úhradě. Pětiminutová
// cache chrání denní limit iDokladu, ale stále promítne nový nákup prakticky
// okamžitě. Klíčem je IČO předané až po serverové autorizaci organizace.
export const getIdokladPurchaseHistory = unstable_cache(
  loadIdokladPurchaseHistory,
  ["idoklad-purchase-history-v1"],
  { revalidate: 300, tags: ["idoklad-purchase-history"] }
);


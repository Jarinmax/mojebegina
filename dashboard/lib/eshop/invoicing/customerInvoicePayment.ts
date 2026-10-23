import "server-only";

import { IDOKLAD_ENUMS } from "./idoklad";
import { EshopIdokladClient, eqFilter } from "./idokladHttp";
import { eshopIdokladCredentials, liveInvoicingGate } from "./mode";

type Env = Record<string, string | undefined>;

type IdokladContact = { Id?: unknown; IdentificationNumber?: unknown };
type IdokladInvoice = {
  Id?: unknown;
  DocumentNumber?: unknown;
  VariableSymbol?: unknown;
  PartnerId?: unknown;
  CurrencyId?: unknown;
  DateOfIssue?: unknown;
  DateOfMaturity?: unknown;
  PaymentStatus?: unknown;
  IsPaid?: unknown;
  Items?: unknown;
  Prices?: { TotalWithVat?: unknown; TotalPaid?: unknown } | null;
};

export type CustomerPayableInvoice = {
  id: number;
  documentNumber: string;
  variableSymbol: string | null;
  partnerId: number;
  issuedAt: Date;
  maturityAt: Date | null;
  totalKc: number;
  paidKc: number;
  amountDueKc: number;
  paid: boolean;
  items: { name: string; quantity: number; unitPriceKc: number }[];
};

export type CustomerInvoicePaymentOptions = {
  env?: Env;
  fetchImpl?: typeof fetch;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number > 0 ? number : null;
}

function exactMoney(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number === null || number < 0 || Math.abs(number * 100 - Math.round(number * 100)) > 1e-6) return null;
  return Math.round(number * 100) / 100;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPaid(invoice: IdokladInvoice): boolean {
  return invoice.IsPaid === true || invoice.PaymentStatus === IDOKLAD_ENUMS.PaymentStatus.Paid || invoice.PaymentStatus === "Paid" || invoice.PaymentStatus === "1";
}

function items(value: unknown): CustomerPayableInvoice["items"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as { Name?: unknown; Amount?: unknown; UnitPrice?: unknown; Prices?: { UnitPrice?: unknown; TotalWithVat?: unknown } | null };
    if (typeof item.Name !== "string" || !item.Name.trim()) return [];
    const quantity = finiteNumber(item.Amount) ?? 1;
    const unit = finiteNumber(item.UnitPrice) ?? finiteNumber(item.Prices?.UnitPrice);
    const total = finiteNumber(item.Prices?.TotalWithVat);
    return [{ name: item.Name.trim(), quantity, unitPriceKc: unit ?? (total !== null && quantity !== 0 ? total / quantity : 0) }];
  });
}

function parseInvoice(invoice: IdokladInvoice): CustomerPayableInvoice | null {
  const id = positiveInteger(invoice.Id);
  const partnerId = positiveInteger(invoice.PartnerId);
  const documentNumber = typeof invoice.DocumentNumber === "string" ? invoice.DocumentNumber.trim() : "";
  const issuedAt = date(invoice.DateOfIssue);
  const totalKc = exactMoney(invoice.Prices?.TotalWithVat);
  const paidKc = exactMoney(invoice.Prices?.TotalPaid) ?? 0;
  if (!id || !partnerId || !documentNumber || !issuedAt || totalKc === null || paidKc > totalKc) return null;
  // Agenda Beginy účtuje v CZK (CurrencyId 1). Neznámou/jinou měnu kartou ani QR neúčtujeme.
  if (invoice.CurrencyId !== undefined && invoice.CurrencyId !== null && invoice.CurrencyId !== 1) return null;
  const paid = isPaid(invoice) || paidKc >= totalKc;
  const variableSymbol = typeof invoice.VariableSymbol === "string" && /^\d{1,10}$/.test(invoice.VariableSymbol.trim())
    ? invoice.VariableSymbol.trim()
    : null;
  return {
    id,
    partnerId,
    documentNumber,
    variableSymbol,
    issuedAt,
    maturityAt: date(invoice.DateOfMaturity),
    totalKc,
    paidKc,
    amountDueKc: paid ? 0 : Math.round((totalKc - paidKc) * 100) / 100,
    paid,
    items: items(invoice.Items),
  };
}

function client(options: CustomerInvoicePaymentOptions, writesAllowed: boolean): EshopIdokladClient | null {
  const env = options.env ?? process.env;
  const credentials = eshopIdokladCredentials(env);
  return credentials
    ? new EshopIdokladClient({ ...credentials, writesAllowed, env, fetchImpl: options.fetchImpl, requestBudget: 20 })
    : null;
}

/** Načte fakturu pouze tehdy, když skutečně patří kontaktu se zadaným IČO. */
export async function loadCustomerInvoiceByIco(
  invoiceId: number,
  ico: string,
  options: CustomerInvoicePaymentOptions = {}
): Promise<CustomerPayableInvoice | null> {
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) return null;
  const api = client(options, false);
  if (!api) return null;
  const normalizedIco = ico.replace(/\s/g, "");
  const contacts = await api.list<IdokladContact>("/Contacts", eqFilter("IdentificationNumber", ico), 100);
  const contactIds = new Set(contacts.Items.flatMap((contact) => {
    const id = positiveInteger(contact.Id);
    const contactIco = typeof contact.IdentificationNumber === "string" ? contact.IdentificationNumber.replace(/\s/g, "") : "";
    return id && contactIco === normalizedIco ? [id] : [];
  }));
  if (contactIds.size === 0) return null;
  const parsed = parseInvoice(await api.get<IdokladInvoice>(`/IssuedInvoices/${invoiceId}`));
  return parsed && contactIds.has(parsed.partnerId) ? parsed : null;
}

export type SettleCustomerInvoiceResult = "paid" | "already-paid" | "amount-mismatch" | "invoice-mismatch";

/** Webhook znovu načte iDoklad a teprve potom označí přesně uhrazenou fakturu za zaplacenou. */
export async function settleCustomerInvoice(
  input: { invoiceId: number; partnerId: number; amountHal: number },
  options: CustomerInvoicePaymentOptions = {}
): Promise<SettleCustomerInvoiceResult> {
  const env = options.env ?? process.env;
  const gate = liveInvoicingGate(env);
  if (!gate.open) throw new Error(`Platbu nelze zapsat do iDokladu: ${gate.reason}`);
  const api = client(options, true);
  if (!api) throw new Error("Chybí přístupové údaje k iDokladu.");
  const invoice = parseInvoice(await api.get<IdokladInvoice>(`/IssuedInvoices/${input.invoiceId}`));
  if (!invoice || invoice.partnerId !== input.partnerId) return "invoice-mismatch";
  if (invoice.paid) return "already-paid";
  if (Math.round(invoice.amountDueKc * 100) !== input.amountHal) return "amount-mismatch";
  const day = new Date().toISOString().slice(0, 10);
  await api.put<boolean>(`/IssuedDocumentPayments/FullyPay/${invoice.id}`, { dateOfPayment: `${day} 12:00:00.000` });
  const verified = parseInvoice(await api.get<IdokladInvoice>(`/IssuedInvoices/${invoice.id}`));
  if (!verified?.paid) throw new Error("iDoklad po zápisu nepotvrdil úhradu faktury.");
  return "paid";
}

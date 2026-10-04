// Finance 1.0 — převod odpovědí iDoklad API v3 na doménový model
// (lib/finance/types.ts). Tady se rozhoduje o znaméncích a datech — jediné
// místo, aby se pravidla nerozjela mezi synchronizací a výpočty.
//
// Pravidla:
//   • Částky jen z polí *Hc (v CZK), převedené na haléře.
//   • Dobropis je VŽDY záporný (−|částka|), bez ohledu na znaménko z API —
//     znaménko dobropisů v API v3 není ověřené na reálných datech.
//   • Úhrada k dobropisu (vratka zákazníkovi) je VŽDY záporná.
//   • Konečná faktura po záloze: tržba = hodnota prodeje před odečtem
//     zálohy (položky ItemTypeReduce se přičtou zpět). Záloha sama tržbou
//     není nikdy.
//   • Prázdné datum iDokladu (1753-01-01 / 0001-01-01) = null.
//   • Datum s časovou zónou se převede na kalendářní den v Europe/Prague.
import { createHash } from "node:crypto";
import { toHalere, type Halere } from "../money";
import type {
  FinDocType,
  FinDocument,
  FinPayment,
  FinPaymentStatus,
  IsoDate,
  VatMode,
} from "../types";
import type {
  ApiAddress,
  ApiAgenda,
  ApiCreditNote,
  ApiEnum,
  ApiIssuedDocumentPayment,
  ApiIssuedInvoice,
  ApiProformaInvoice,
  ApiReceivedDocumentPayment,
  ApiReceivedInvoice,
  ApiReceivedReceipt,
  ApiSalesReceipt,
  ApiTag,
} from "./apiTypes";
import { IdokladError } from "./errors";

// ---------------------------------------------------------------- pomocné

const EMPTY_DATE_PREFIXES = ["0001-", "1753-", "1900-01-01"];
const PRAGUE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toIsoDate(value: string | null | undefined): IsoDate | null {
  if (!value) return null;
  if (EMPTY_DATE_PREFIXES.some((prefix) => value.startsWith(prefix))) return null;
  if (/T.*(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return PRAGUE_DATE.format(parsed);
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

function toTimestamp(value: string | null | undefined): string | null {
  if (!value || EMPTY_DATE_PREFIXES.some((prefix) => value.startsWith(prefix))) return null;
  return value;
}

function enumValue(value: ApiEnum | null | undefined, names: Record<number, string>): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return names[value] ?? null;
  const asNumber = Number(value);
  if (Number.isInteger(asNumber) && String(asNumber) === value) return names[asNumber] ?? null;
  return value;
}

const PAYMENT_STATUS_NAMES: Record<number, string> = { 0: "Unpaid", 1: "Paid", 2: "PartialPaid", 3: "Overpaid" };
const PAYMENT_STATUS_MAP: Record<string, FinPaymentStatus> = {
  Unpaid: "unpaid",
  Paid: "paid",
  PartialPaid: "partially_paid",
  Overpaid: "overpaid",
};

function paymentStatus(value: ApiEnum | null | undefined): FinPaymentStatus | null {
  const name = enumValue(value, PAYMENT_STATUS_NAMES);
  return name ? (PAYMENT_STATUS_MAP[name] ?? null) : null;
}

const ITEM_TYPE_NAMES: Record<number, string> = {
  0: "ItemTypeNormal",
  1: "ItemTypeRound",
  2: "ItemTypeReduce",
  3: "ItemTypeDiscount",
};

const DOCUMENT_TYPE_NAMES: Record<number, string> = {
  0: "IssuedInvoice",
  1: "ProformaInvoice",
  2: "CashVoucher",
  3: "CreditNote",
  4: "BankStatement",
  5: "ReceivedInvoice",
  6: "SalesReceipt",
  10: "IssuedTaxDocument",
};

const VAT_REGISTRATION_NAMES: Record<number, string> = {
  0: "NotVatPayer",
  1: "VatPayer",
  2: "IdentifiedPersonVat",
};

function requireId(value: number | undefined, what: string): string {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new IdokladError("invalid_response", { detail: `${what}: chybí Id` });
  }
  return String(value);
}

function optionalId(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? String(value) : null;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function partnerName(address: ApiAddress | null | undefined): string | null {
  if (!address) return null;
  const person = [address.Firstname, address.Surname].map(cleanText).filter(Boolean).join(" ");
  return cleanText(address.CompanyName) ?? cleanText(address.NickName) ?? (person || null);
}

// Stabilní JSON (seřazené klíče) → stejný doklad dá vždy stejný hash,
// i když iDoklad pošle pole v jiném pořadí.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function contentHash(raw: unknown): string {
  return createHash("sha256").update(stableStringify(raw)).digest("hex");
}

function negate(value: Halere): Halere {
  return -Math.abs(value);
}

// ---------------------------------------------------------------- doklady

type AnyApiDocument =
  | ApiIssuedInvoice
  | ApiCreditNote
  | ApiProformaInvoice
  | ApiSalesReceipt
  | ApiReceivedInvoice
  | ApiReceivedReceipt;

function baseDocument(docType: FinDocType, api: AnyApiDocument): FinDocument {
  const externalId = requireId(api.Id, docType);
  const prices = api.Prices ?? {};
  const totalWithoutVat = toHalere(prices.TotalWithoutVatHc);
  const totalVat = toHalere(prices.TotalVatHc);
  const totalWithVat = toHalere(prices.TotalWithVatHc);
  const address = api.PartnerAddress ?? api.Partner ?? null;
  return {
    source: "idoklad",
    docType,
    externalId,
    direction: docType === "received_invoice" || docType === "received_receipt" ? "cost" : "revenue",
    documentNumber: cleanText(api.DocumentNumber),
    variableSymbol: cleanText(api.VariableSymbol),
    orderNumber: cleanText(api.OrderNumber),
    partnerExternalId: optionalId(api.PartnerId),
    partnerName: partnerName(address),
    partnerIco: cleanText(address?.IdentificationNumber),
    dateOfIssue: toIsoDate(api.DateOfIssue),
    dateOfTaxing: toIsoDate(api.DateOfTaxing),
    dateOfMaturity: toIsoDate(api.DateOfMaturity),
    dateOfPayment: toIsoDate(api.DateOfPayment),
    dateOfReceiving: toIsoDate(api.DateOfReceiving),
    currencyId: typeof api.CurrencyId === "number" ? api.CurrencyId : null,
    exchangeRate: typeof api.ExchangeRate === "number" ? api.ExchangeRate : null,
    totalWithoutVat,
    totalVat,
    totalWithVat,
    revenueWithVat: totalWithVat,
    revenueWithoutVat: totalWithoutVat,
    totalPaid: toHalere(prices.TotalPaidHc),
    paymentStatus: paymentStatus(api.PaymentStatus),
    creditedExternalId: null,
    accountedByInvoiceExternalId: null,
    deductedProformaExternalIds: [],
    tagIds: (api.Tags ?? [])
      .map((tag) => tag.TagId)
      .filter((id): id is number => typeof id === "number"),
    isDeleted: false,
    deletedAt: null,
    externalCreatedAt: toTimestamp(api.Metadata?.DateCreated),
    externalChangedAt: toTimestamp(api.Metadata?.DateLastChange),
    raw: api,
    contentHash: contentHash(api),
  };
}

export function normalizeIssuedInvoice(api: ApiIssuedInvoice): FinDocument {
  const doc = baseDocument("issued_invoice", api);
  let reduceWithVat = 0;
  let reduceWithoutVat = 0;
  const proformaIds = new Set<string>();
  for (const item of api.Items ?? []) {
    if (enumValue(item.ItemType, ITEM_TYPE_NAMES) !== "ItemTypeReduce") continue;
    reduceWithVat += Math.abs(toHalere(item.Prices?.TotalWithVatHc));
    reduceWithoutVat += Math.abs(toHalere(item.Prices?.TotalWithoutVatHc));
    const proformaId = optionalId(item.InvoiceProformaId);
    if (proformaId) proformaIds.add(proformaId);
  }
  return {
    ...doc,
    revenueWithVat: doc.totalWithVat + reduceWithVat,
    revenueWithoutVat: doc.totalWithoutVat + reduceWithoutVat,
    deductedProformaExternalIds: [...proformaIds].sort(),
  };
}

export function normalizeCreditNote(api: ApiCreditNote): FinDocument {
  const doc = baseDocument("credit_note", api);
  return {
    ...doc,
    totalWithoutVat: negate(doc.totalWithoutVat),
    totalVat: negate(doc.totalVat),
    totalWithVat: negate(doc.totalWithVat),
    revenueWithVat: negate(doc.totalWithVat),
    revenueWithoutVat: negate(doc.totalWithoutVat),
    totalPaid: negate(doc.totalPaid),
    creditedExternalId: optionalId(api.CreditedInvoiceId),
  };
}

// Záloha: stahuje se jen kvůli vysvětlení úhrad. Tržbou není — revenue* = 0.
export function normalizeProformaInvoice(api: ApiProformaInvoice): FinDocument {
  const doc = baseDocument("proforma_invoice", api);
  return {
    ...doc,
    revenueWithVat: 0,
    revenueWithoutVat: 0,
    accountedByInvoiceExternalId: optionalId(api.AccountedByInvoiceId),
  };
}

// Prodejka je zaplacená při vystavení (úhrady nese uvnitř dokladu).
export function normalizeSalesReceipt(api: ApiSalesReceipt): FinDocument {
  const doc = baseDocument("sales_receipt", api);
  const paid = (api.Payments ?? []).reduce((sum, payment) => sum + toHalere(payment.Prices?.PaymentAmountHc), 0);
  return {
    ...doc,
    totalPaid: paid,
    paymentStatus: paid >= doc.totalWithVat ? "paid" : paid > 0 ? "partially_paid" : "unpaid",
    dateOfPayment: doc.dateOfIssue,
  };
}

export function normalizeReceivedInvoice(api: ApiReceivedInvoice): FinDocument {
  const doc = baseDocument("received_invoice", api);
  return { ...doc, revenueWithVat: 0, revenueWithoutVat: 0 };
}

// Přijatá účtenka (výdaj zaplacený na místě) — náklad i výdaj v den vystavení.
export function normalizeReceivedReceipt(api: ApiReceivedReceipt): FinDocument {
  const doc = baseDocument("received_receipt", api);
  return {
    ...doc,
    revenueWithVat: 0,
    revenueWithoutVat: 0,
    totalPaid: doc.totalWithVat,
    paymentStatus: "paid",
    dateOfPayment: doc.dateOfIssue,
  };
}

// ---------------------------------------------------------------- úhrady

const ISSUED_PAYMENT_DOC_TYPES: Record<string, FinDocType> = {
  IssuedInvoice: "issued_invoice",
  ProformaInvoice: "proforma_invoice",
  CreditNote: "credit_note",
  SalesReceipt: "sales_receipt",
};

export type PaymentNormalization =
  | { payment: FinPayment; skipped?: undefined }
  | { payment: null; skipped: string };

// Úhrady prodejek se berou VÝHRADNĚ z prodejky samotné (SalesReceipt.Payments).
// Kdyby je iDoklad vracel i v IssuedDocumentPayments, započetly by se
// dvakrát — proto se tady přeskakují.
export function normalizeIssuedPayment(api: ApiIssuedDocumentPayment): PaymentNormalization {
  const externalId = requireId(api.Id, "IssuedDocumentPayment");
  const typeName = enumValue(api.DocumentType, DOCUMENT_TYPE_NAMES) ?? "IssuedInvoice";
  const documentType = ISSUED_PAYMENT_DOC_TYPES[typeName];
  if (!documentType) {
    return { payment: null, skipped: `úhrada ${externalId}: nepodporovaný typ dokladu ${typeName}` };
  }
  if (documentType === "sales_receipt") {
    return { payment: null, skipped: `úhrada ${externalId}: úhrada prodejky se čte z prodejky` };
  }
  const amount = toHalere(api.Prices?.PaymentAmountHc);
  return {
    payment: {
      source: "idoklad",
      side: "issued",
      externalId,
      documentType,
      documentExternalId: requireId(api.InvoiceId, `úhrada ${externalId}`),
      dateOfPayment: toIsoDate(api.DateOfPayment),
      amount: documentType === "credit_note" ? negate(amount) : amount,
      paymentOptionId: api.PaymentOptionId ?? null,
      bankStatementExternalId: optionalId(api.BankStatementId),
      cashVoucherExternalId: optionalId(api.CashVoucherId),
      isDeleted: false,
      externalChangedAt: toTimestamp(api.Metadata?.DateLastChange),
      raw: api,
      contentHash: contentHash(api),
    },
  };
}

export function normalizeSalesReceiptPayments(api: ApiSalesReceipt): FinPayment[] {
  const receiptId = requireId(api.Id, "sales_receipt");
  const date = toIsoDate(api.DateOfIssue);
  return (api.Payments ?? []).map((payment, index) => {
    const paymentId = typeof payment.Id === "number" ? String(payment.Id) : `i${index}`;
    return {
      source: "idoklad",
      side: "issued",
      externalId: `sr-${receiptId}-${paymentId}`,
      documentType: "sales_receipt",
      documentExternalId: receiptId,
      dateOfPayment: date,
      amount: toHalere(payment.Prices?.PaymentAmountHc),
      paymentOptionId: payment.PaymentOptionId ?? null,
      bankStatementExternalId: null,
      cashVoucherExternalId: null,
      isDeleted: false,
      externalChangedAt: toTimestamp(payment.Metadata?.DateLastChange ?? api.Metadata?.DateLastChange),
      raw: payment,
      contentHash: contentHash(payment),
    };
  });
}

const RECEIVED_PAYMENT_DOCUMENT_NAMES: Record<number, string> = { 2: "CashVoucher", 4: "BankStatement" };

export function normalizeReceivedPayment(api: ApiReceivedDocumentPayment): FinPayment {
  const externalId = requireId(api.Id, "ReceivedDocumentPayment");
  const documentKind = enumValue(api.PaymentDocument?.DocumentType, RECEIVED_PAYMENT_DOCUMENT_NAMES);
  const linkedId = optionalId(api.PaymentDocument?.Id);
  return {
    source: "idoklad",
    side: "received",
    externalId,
    documentType: "received_invoice",
    documentExternalId: requireId(api.InvoiceId, `úhrada ${externalId}`),
    dateOfPayment: toIsoDate(api.DateOfPayment),
    amount: toHalere(api.Prices?.PaymentAmountHc),
    paymentOptionId: api.PaymentOptionId ?? null,
    bankStatementExternalId: documentKind === "BankStatement" ? linkedId : null,
    cashVoucherExternalId: documentKind === "CashVoucher" ? linkedId : null,
    isDeleted: false,
    externalChangedAt: toTimestamp(api.Metadata?.DateLastChange),
    raw: api,
    contentHash: contentHash(api),
  };
}

// ---------------------------------------------------------------- číselníky

export type FinTag = { id: number; name: string };

export function normalizeTags(api: ApiTag[]): FinTag[] {
  return api
    .filter((tag): tag is { Id: number; Name: string } => typeof tag.Id === "number" && typeof tag.Name === "string")
    .map((tag) => ({ id: tag.Id, name: tag.Name.trim() }));
}

export type AgendaInfo = {
  agendaId: string;
  name: string | null;
  ico: string | null;
  // null = iDoklad vrátil neznámou hodnotu → import se nespustí
  vatMode: VatMode | "identified_person" | null;
};

export function normalizeAgenda(api: ApiAgenda): AgendaInfo {
  const registration = enumValue(api.VatRegistrationType, VAT_REGISTRATION_NAMES);
  const vatMode =
    registration === "NotVatPayer"
      ? "non_payer"
      : registration === "VatPayer"
        ? "payer"
        : registration === "IdentifiedPersonVat"
          ? "identified_person"
          : null;
  return {
    agendaId: requireId(api.Id, "agenda"),
    name: cleanText(api.Name),
    ico: cleanText(api.Contact?.IdentificationNumber)?.replace(/\s+/g, "") ?? null,
    vatMode,
  };
}

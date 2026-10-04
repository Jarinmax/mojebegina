// Finance 1.0 — snapshot z fixture dat (bez sítě, bez DB). Používají ho
// testy a režim „fixture“ v Preview, kde nesmí být živé přístupové údaje.
import {
  fixtureCreditNotes,
  fixtureIssuedInvoices,
  fixtureIssuedPayments,
  fixtureProformaInvoices,
  fixtureReceivedInvoices,
  fixtureReceivedPayments,
  fixtureReceivedReceipts,
  fixtureSalesReceipts,
  fixtureTags,
} from "./__fixtures__/idoklad";
import {
  normalizeCreditNote,
  normalizeIssuedInvoice,
  normalizeIssuedPayment,
  normalizeProformaInvoice,
  normalizeReceivedInvoice,
  normalizeReceivedPayment,
  normalizeReceivedReceipt,
  normalizeSalesReceipt,
  normalizeSalesReceiptPayments,
  normalizeTags,
} from "./idoklad/normalize";
import type { FinanceSnapshot } from "./store";
import type { FinDocumentLink, FinPayment } from "./types";

export const FIXTURE_LINKS: FinDocumentLink[] = [
  { kind: "receipt_in_invoice", receiptExternalId: "401", invoiceExternalId: "110" },
  // Vazba na objednávku je jen informační — nesmí změnit žádné číslo (D6).
  {
    kind: "order",
    documentExternalId: "101",
    docType: "issued_invoice",
    orderId: "329f54d5-5a7d-4522-a21e-b7ad9cde24e2",
    matchMethod: "document_number",
  },
];

export function buildFixtureSnapshot(): FinanceSnapshot {
  const issuedPayments = fixtureIssuedPayments
    .map(normalizeIssuedPayment)
    .map((result) => result.payment)
    .filter((payment): payment is FinPayment => payment !== null);
  return {
    documents: [
      ...fixtureIssuedInvoices.map(normalizeIssuedInvoice),
      ...fixtureCreditNotes.map(normalizeCreditNote),
      ...fixtureProformaInvoices.map(normalizeProformaInvoice),
      ...fixtureSalesReceipts.map(normalizeSalesReceipt),
      ...fixtureReceivedInvoices.map(normalizeReceivedInvoice),
      ...fixtureReceivedReceipts.map(normalizeReceivedReceipt),
    ],
    payments: [
      ...issuedPayments,
      ...fixtureSalesReceipts.flatMap(normalizeSalesReceiptPayments),
      ...fixtureReceivedPayments.map(normalizeReceivedPayment),
    ],
    links: [...FIXTURE_LINKS],
    tags: normalizeTags(fixtureTags),
  };
}

// Finance 1.0 — výpočty finančních ukazatelů. Čisté funkce nad snapshotem
// (žádné I/O): stejná čísla musí po migraci vracet SQL view (fin_v_*),
// a testy nad fixture daty to budou hlídat.
//
// Definice (schváleno 4. 10. 2026):
//   Fakturovaná tržba  = vydané faktury + prodejky − dobropisy, podle DATA
//                        VYSTAVENÍ (DUZP je uložené jako alternativa).
//                        Dobropis snižuje tržbu v období SVÉHO vystavení.
//                        Zálohy tržbou nejsou; konečná faktura se počítá
//                        v plné hodnotě prodeje (před odečtem zálohy).
//   Uhrazená tržba     = přijaté platby za prodej podle DATA PLATBY
//                        (úhrady faktur a záloh, prodejky; vratky k
//                        dobropisům se odečítají).
//   Náklady            = přijaté faktury + přijaté účtenky evidované
//                        v iDokladu. Neplátce DPH: včetně DPH.
//   Pohledávky/závazky = neuhrazené zůstatky k datu, z toho po splatnosti.
//   Cashflow           = příjmy − výdaje evidované v iDokladu.
//   Provozní výsledek  = fakturovaná tržba − evidované náklady. NIKDY se
//                        nenazývá „zisk“ — iDoklad nezachycuje všechny
//                        náklady (viz FINANCE_COVERAGE).
//
// Pravidla proti dvojímu započtení (každé má test v __tests__/metrics.test.ts):
//   D1 Prodejka zahrnutá do vydané faktury (vazba receipt_in_invoice) se
//      do tržby nepočítá — tržbou je faktura. Peníze přijaté na prodejku
//      zůstávají (skutečně přišly) a úhrady faktury se o ně zkrátí, aby
//      tatáž platba nebyla dvakrát.
//   D2 Záloha není tržba; platba na zálohu je příjem jednou; odečet zálohy
//      na konečné faktuře se do tržby přičítá zpět (ne odečítá).
//   D3 Úhrada spárovaná s bankovním/pokladním pohybem se počítá jen jako
//      úhrada; spárovaný pohyb se přeskočí.
//   D4 Dobropis (plný i částečný) je záporná tržba ve svém období a sníží
//      pohledávku původní faktury; vazba na fakturu zůstává dohledatelná.
//   D5 Smazaný doklad (is_deleted) ani jeho úhrady se nepočítají; po
//      obnovení se počítají znovu.
//   D6 Objednávky (orders) se do financí nepočítají nikdy — vazba
//      kind "order" je jen informační.
import { sumHalere, type Halere } from "./money";
import { daysBetween, isInPeriod, type Period } from "./periods";
import { SEGMENT_LABELS, SEGMENT_ORDER, assignSegment, type SegmentAssignment } from "./segments";
import type { FinanceSnapshot } from "./store";
import type {
  FinCashMovement,
  FinDocType,
  FinDocument,
  FinPayment,
  FinSegment,
  IsoDate,
  VatMode,
} from "./types";
import type { FinTag } from "./idoklad/normalize";

export type DateBasis = "issue" | "taxing";

export type MetricOptions = {
  vatMode: VatMode;
  dateBasis?: DateBasis;
};

export type FinanceWarningCode =
  | "payment_without_document"
  | "payment_total_mismatch"
  | "receipt_invoice_payment_overlap"
  | "suspected_receipt_invoice_duplicate"
  | "receipt_link_invalid"
  | "credit_note_without_invoice"
  | "document_without_date"
  | "unassigned_segment";

export type FinanceWarning = {
  code: FinanceWarningCode;
  message: string;
  amount?: Halere;
  documents?: string[];
};

type EffectivePayment = {
  payment: FinPayment;
  document: FinDocument;
  counted: Halere; // po zkrácení podle D1
};

export type FinanceContext = {
  options: Required<MetricOptions>;
  active: FinDocument[];
  byRef: Map<string, FinDocument>;
  tags: Map<number, FinTag>;
  supersededReceipts: Map<string, string>; // receiptId → invoiceId
  receiptsByInvoice: Map<string, string[]>;
  issuedPayments: EffectivePayment[];
  receivedPayments: EffectivePayment[];
  warnings: FinanceWarning[];
};

const REVENUE_DOC_TYPES: ReadonlySet<FinDocType> = new Set(["issued_invoice", "credit_note", "sales_receipt"]);
const COST_DOC_TYPES: ReadonlySet<FinDocType> = new Set(["received_invoice", "received_receipt"]);
const MISMATCH_TOLERANCE: Halere = 100; // 1 Kč — zaokrouhlení

function ref(docType: FinDocType, externalId: string): string {
  return `${docType}|${externalId}`;
}

function label(doc: FinDocument): string {
  return doc.documentNumber ?? `${doc.docType} ${doc.externalId}`;
}

function byDateThenId(a: EffectivePayment, b: EffectivePayment): number {
  const da = a.payment.dateOfPayment ?? "";
  const db = b.payment.dateOfPayment ?? "";
  if (da !== db) return da < db ? -1 : 1;
  return a.payment.externalId < b.payment.externalId ? -1 : a.payment.externalId > b.payment.externalId ? 1 : 0;
}

export function buildFinanceContext(snapshot: FinanceSnapshot, options: MetricOptions): FinanceContext {
  const warnings: FinanceWarning[] = [];
  const active = snapshot.documents.filter((doc) => !doc.isDeleted); // D5
  const byRef = new Map(active.map((doc) => [ref(doc.docType, doc.externalId), doc]));
  const tags = new Map(snapshot.tags.map((tag) => [tag.id, tag]));

  // D1 — vazby prodejka → faktura
  const supersededReceipts = new Map<string, string>();
  const receiptsByInvoice = new Map<string, string[]>();
  for (const link of snapshot.links) {
    if (link.kind !== "receipt_in_invoice") continue; // D6: vazba na objednávku nic nepočítá
    const receipt = byRef.get(ref("sales_receipt", link.receiptExternalId));
    const invoice = byRef.get(ref("issued_invoice", link.invoiceExternalId));
    if (!receipt || !invoice) {
      warnings.push({
        code: "receipt_link_invalid",
        message: `Vazba prodejky ${link.receiptExternalId} na fakturu ${link.invoiceExternalId} odkazuje na neexistující nebo smazaný doklad — prodejka se počítá samostatně.`,
      });
      continue;
    }
    supersededReceipts.set(receipt.externalId, invoice.externalId);
    receiptsByInvoice.set(invoice.externalId, [...(receiptsByInvoice.get(invoice.externalId) ?? []), receipt.externalId]);
  }

  // Úhrady: jen nesmazané a jen k existujícímu nesmazanému dokladu (D5).
  const issuedPayments: EffectivePayment[] = [];
  const receivedPayments: EffectivePayment[] = [];
  for (const payment of snapshot.payments) {
    if (payment.isDeleted) continue;
    const document = byRef.get(ref(payment.documentType, payment.documentExternalId));
    if (!document) {
      const deleted = snapshot.documents.some(
        (doc) => doc.isDeleted && doc.docType === payment.documentType && doc.externalId === payment.documentExternalId
      );
      if (!deleted) {
        warnings.push({
          code: "payment_without_document",
          message: `Úhrada ${payment.externalId} (${payment.amount / 100} Kč) patří k dokladu, který nebyl stažen — nezapočítána.`,
          amount: payment.amount,
        });
      }
      continue;
    }
    const effective = { payment, document, counted: payment.amount };
    (payment.side === "issued" ? issuedPayments : receivedPayments).push(effective);
  }

  // D1 — úhrady faktury se zkrátí o peníze už přijaté na zahrnuté prodejky.
  for (const [invoiceId, receiptIds] of receiptsByInvoice) {
    let allowance = sumHalere(
      issuedPayments
        .filter((p) => p.document.docType === "sales_receipt" && receiptIds.includes(p.document.externalId))
        .map((p) => p.counted)
    );
    const invoicePayments = issuedPayments
      .filter((p) => p.document.docType === "issued_invoice" && p.document.externalId === invoiceId)
      .sort(byDateThenId);
    let trimmedTotal = 0;
    for (const p of invoicePayments) {
      if (allowance <= 0) break;
      const trim = Math.min(allowance, Math.max(0, p.counted));
      p.counted -= trim;
      allowance -= trim;
      trimmedTotal += trim;
    }
    if (trimmedTotal > 0) {
      const invoice = byRef.get(ref("issued_invoice", invoiceId));
      warnings.push({
        code: "receipt_invoice_payment_overlap",
        message: `Faktura ${invoice ? label(invoice) : invoiceId} má úhradu, která už byla přijata na zahrnuté prodejky — ${trimmedTotal / 100} Kč započteno jen jednou.`,
        amount: trimmedTotal,
        documents: [invoiceId, ...receiptIds],
      });
    }
  }

  // Kontrola: součet stažených úhrad = „uhrazeno“ podle iDokladu.
  const paymentsByDoc = new Map<string, Halere>();
  for (const p of [...issuedPayments, ...receivedPayments]) {
    const key = ref(p.document.docType, p.document.externalId);
    paymentsByDoc.set(key, (paymentsByDoc.get(key) ?? 0) + p.payment.amount);
  }
  for (const doc of active) {
    if (doc.docType === "sales_receipt" || doc.docType === "received_receipt") continue;
    const paid = paymentsByDoc.get(ref(doc.docType, doc.externalId)) ?? 0;
    if (Math.abs(paid - doc.totalPaid) > MISMATCH_TOLERANCE) {
      warnings.push({
        code: "payment_total_mismatch",
        message: `Doklad ${label(doc)}: stažené úhrady ${paid / 100} Kč, iDoklad uvádí uhrazeno ${doc.totalPaid / 100} Kč.`,
        amount: doc.totalPaid - paid,
        documents: [doc.externalId],
      });
    }
    if (doc.docType === "credit_note" && (!doc.creditedExternalId || !byRef.has(ref("issued_invoice", doc.creditedExternalId)))) {
      warnings.push({
        code: "credit_note_without_invoice",
        message: `Dobropis ${label(doc)} nemá dohledatelnou původní fakturu — snižuje tržbu, ale nesnižuje žádnou pohledávku.`,
        documents: [doc.externalId],
      });
    }
  }

  return {
    options: { vatMode: options.vatMode, dateBasis: options.dateBasis ?? "issue" },
    active,
    byRef,
    tags,
    supersededReceipts,
    receiptsByInvoice,
    issuedPayments,
    receivedPayments,
    warnings,
  };
}

// ------------------------------------------------------------ pomocné

function segmentOf(ctx: FinanceContext, doc: FinDocument): SegmentAssignment {
  const credited = doc.creditedExternalId ? ctx.byRef.get(ref("issued_invoice", doc.creditedExternalId)) : undefined;
  return assignSegment(doc, ctx.tags, credited);
}

function revenueDate(ctx: FinanceContext, doc: FinDocument): IsoDate | null {
  return ctx.options.dateBasis === "taxing" ? (doc.dateOfTaxing ?? doc.dateOfIssue) : doc.dateOfIssue;
}

function costDate(ctx: FinanceContext, doc: FinDocument): IsoDate | null {
  if (ctx.options.dateBasis === "taxing") return doc.dateOfTaxing ?? doc.dateOfIssue ?? doc.dateOfReceiving;
  return doc.dateOfIssue ?? doc.dateOfReceiving;
}

function emptySegments(): Record<FinSegment, Halere> {
  return Object.fromEntries(SEGMENT_ORDER.map((segment) => [segment, 0])) as Record<FinSegment, Halere>;
}

export type MetricLine = {
  docType: FinDocType;
  externalId: string;
  documentNumber: string | null;
  partnerName: string | null;
  date: IsoDate | null;
  amount: Halere;
  segment: FinSegment;
};

export type MetricResult = {
  total: Halere;
  byDocType: Partial<Record<FinDocType, Halere>>;
  bySegment: Record<FinSegment, Halere>;
  lines: MetricLine[];
};

function collect(lines: MetricLine[]): MetricResult {
  const byDocType: Partial<Record<FinDocType, Halere>> = {};
  const bySegment = emptySegments();
  for (const line of lines) {
    byDocType[line.docType] = (byDocType[line.docType] ?? 0) + line.amount;
    bySegment[line.segment] += line.amount;
  }
  return { total: sumHalere(lines.map((line) => line.amount)), byDocType, bySegment, lines };
}

// ------------------------------------------------------------ ukazatele

export function invoicedRevenue(ctx: FinanceContext, period: Period): MetricResult {
  const lines: MetricLine[] = [];
  for (const doc of ctx.active) {
    if (!REVENUE_DOC_TYPES.has(doc.docType)) continue; // D2: záloha sem nepatří
    if (doc.docType === "sales_receipt" && ctx.supersededReceipts.has(doc.externalId)) continue; // D1
    const date = revenueDate(ctx, doc);
    if (!isInPeriod(date, period)) continue;
    lines.push({
      docType: doc.docType,
      externalId: doc.externalId,
      documentNumber: doc.documentNumber,
      partnerName: doc.partnerName,
      date,
      amount: ctx.options.vatMode === "non_payer" ? doc.revenueWithVat : doc.revenueWithoutVat,
      segment: segmentOf(ctx, doc).segment,
    });
  }
  return collect(lines);
}

export function paidRevenue(ctx: FinanceContext, period: Period): MetricResult {
  const lines: MetricLine[] = [];
  for (const p of ctx.issuedPayments) {
    if (p.counted === 0 || !isInPeriod(p.payment.dateOfPayment, period)) continue;
    lines.push({
      docType: p.document.docType,
      externalId: p.document.externalId,
      documentNumber: p.document.documentNumber,
      partnerName: p.document.partnerName,
      date: p.payment.dateOfPayment,
      amount: p.counted,
      segment: segmentOf(ctx, p.document).segment,
    });
  }
  return collect(lines);
}

export function recordedCosts(ctx: FinanceContext, period: Period): MetricResult {
  const lines: MetricLine[] = [];
  for (const doc of ctx.active) {
    if (!COST_DOC_TYPES.has(doc.docType)) continue;
    const date = costDate(ctx, doc);
    if (!isInPeriod(date, period)) continue;
    lines.push({
      docType: doc.docType,
      externalId: doc.externalId,
      documentNumber: doc.documentNumber,
      partnerName: doc.partnerName,
      date,
      amount: ctx.options.vatMode === "non_payer" ? doc.totalWithVat : doc.totalWithoutVat,
      segment: segmentOf(ctx, doc).segment,
    });
  }
  return collect(lines);
}

export type CashFlowResult = {
  cashIn: Halere;
  cashOut: Halere;
  net: Halere;
  // D3 — pohyby spárované s doklady (už započtené přes úhrady)
  skippedPairedMovements: number;
  unpairedMovementsIn: Halere;
  unpairedMovementsOut: Halere;
};

export function cashFlow(ctx: FinanceContext, period: Period, movements: FinCashMovement[] = []): CashFlowResult {
  const paymentsIn = paidRevenue(ctx, period).total;
  const paymentsOut = sumHalere(
    ctx.receivedPayments.filter((p) => isInPeriod(p.payment.dateOfPayment, period)).map((p) => p.counted)
  );
  // Přijatá účtenka = výdaj zaplacený při vystavení (nemá samostatné úhrady).
  const receiptsOut = sumHalere(
    ctx.active
      .filter((doc) => doc.docType === "received_receipt" && isInPeriod(doc.dateOfIssue, period))
      .map((doc) => doc.totalWithVat)
  );
  let skippedPairedMovements = 0;
  let unpairedMovementsIn = 0;
  let unpairedMovementsOut = 0;
  for (const movement of movements) {
    if (!isInPeriod(movement.date, period)) continue;
    if (movement.isPairedToDocument) {
      skippedPairedMovements += 1;
      continue;
    }
    if (movement.amount >= 0) unpairedMovementsIn += movement.amount;
    else unpairedMovementsOut += -movement.amount;
  }
  const cashIn = paymentsIn + unpairedMovementsIn;
  const cashOut = paymentsOut + receiptsOut + unpairedMovementsOut;
  return { cashIn, cashOut, net: cashIn - cashOut, skippedPairedMovements, unpairedMovementsIn, unpairedMovementsOut };
}

export type OpenItem = {
  docType: FinDocType;
  externalId: string;
  documentNumber: string | null;
  partnerName: string | null;
  dateOfIssue: IsoDate | null;
  dateOfMaturity: IsoDate | null;
  total: Halere;
  open: Halere;
  daysOverdue: number; // 0 = není po splatnosti
  segment: FinSegment;
};

export type OpenItemsResult = {
  total: Halere;
  count: number;
  overdueTotal: Halere;
  overdueCount: number;
  items: OpenItem[]; // seřazeno: nejdéle po splatnosti první
  // Dobropisy převyšující zůstatek faktury = peníze k vrácení zákazníkovi
  // (jen informace — ověřit na reálných datech, viz FINANCE_1_0.md).
  creditsToRefund: Halere;
};

function finishOpenItems(items: OpenItem[], creditsToRefund: Halere): OpenItemsResult {
  items.sort((a, b) => b.daysOverdue - a.daysOverdue || b.open - a.open);
  const overdue = items.filter((item) => item.daysOverdue > 0);
  return {
    total: sumHalere(items.map((item) => item.open)),
    count: items.length,
    overdueTotal: sumHalere(overdue.map((item) => item.open)),
    overdueCount: overdue.length,
    items,
    creditsToRefund,
  };
}

function paidUpTo(payments: EffectivePayment[], docType: FinDocType, externalId: string, asOf: IsoDate): Halere {
  return sumHalere(
    payments
      .filter(
        (p) =>
          p.document.docType === docType &&
          p.document.externalId === externalId &&
          p.payment.dateOfPayment !== null &&
          p.payment.dateOfPayment <= asOf
      )
      .map((p) => p.counted)
  );
}

export function receivables(ctx: FinanceContext, asOf: IsoDate): OpenItemsResult {
  const items: OpenItem[] = [];
  let creditsToRefund = 0;
  for (const invoice of ctx.active) {
    if (invoice.docType !== "issued_invoice" || (invoice.dateOfIssue !== null && invoice.dateOfIssue > asOf)) continue;
    let paid = paidUpTo(ctx.issuedPayments, "issued_invoice", invoice.externalId, asOf);
    // D1 — peníze přijaté na zahrnuté prodejky uhrazují fakturu.
    for (const receiptId of ctx.receiptsByInvoice.get(invoice.externalId) ?? []) {
      paid += paidUpTo(ctx.issuedPayments, "sales_receipt", receiptId, asOf);
    }
    // D4 — nevrácená část dobropisů snižuje zůstatek faktury.
    let unrefundedCredits = 0;
    for (const note of ctx.active) {
      if (note.docType !== "credit_note" || note.creditedExternalId !== invoice.externalId) continue;
      if (note.dateOfIssue !== null && note.dateOfIssue > asOf) continue;
      const refunded = -paidUpTo(ctx.issuedPayments, "credit_note", note.externalId, asOf); // vratky jsou záporné
      unrefundedCredits += Math.max(0, Math.abs(note.totalWithVat) - refunded);
    }
    const openBeforeCredits = invoice.totalWithVat - paid;
    const offset = Math.min(Math.max(openBeforeCredits, 0), unrefundedCredits);
    creditsToRefund += unrefundedCredits - offset;
    const open = openBeforeCredits - offset;
    if (open <= 0) continue;
    const daysOverdue =
      invoice.dateOfMaturity && invoice.dateOfMaturity < asOf ? daysBetween(invoice.dateOfMaturity, asOf) : 0;
    items.push({
      docType: invoice.docType,
      externalId: invoice.externalId,
      documentNumber: invoice.documentNumber,
      partnerName: invoice.partnerName,
      dateOfIssue: invoice.dateOfIssue,
      dateOfMaturity: invoice.dateOfMaturity,
      total: invoice.totalWithVat,
      open,
      daysOverdue,
      segment: segmentOf(ctx, invoice).segment,
    });
  }
  return finishOpenItems(items, creditsToRefund);
}

export function payables(ctx: FinanceContext, asOf: IsoDate): OpenItemsResult {
  const items: OpenItem[] = [];
  for (const invoice of ctx.active) {
    if (invoice.docType !== "received_invoice") continue;
    const issued = invoice.dateOfIssue ?? invoice.dateOfReceiving;
    if (issued !== null && issued > asOf) continue;
    const open = invoice.totalWithVat - paidUpTo(ctx.receivedPayments, "received_invoice", invoice.externalId, asOf);
    if (open <= 0) continue;
    const daysOverdue =
      invoice.dateOfMaturity && invoice.dateOfMaturity < asOf ? daysBetween(invoice.dateOfMaturity, asOf) : 0;
    items.push({
      docType: invoice.docType,
      externalId: invoice.externalId,
      documentNumber: invoice.documentNumber,
      partnerName: invoice.partnerName,
      dateOfIssue: invoice.dateOfIssue,
      dateOfMaturity: invoice.dateOfMaturity,
      total: invoice.totalWithVat,
      open,
      daysOverdue,
      segment: segmentOf(ctx, invoice).segment,
    });
  }
  return finishOpenItems(items, 0);
}

// Prodejka a faktura stejnému partnerovi na stejnou částku do 31 dní bez
// vazby receipt_in_invoice — NEvylučuje se automaticky (mohou to být dva
// skutečné prodeje), ale cockpit ji vždy ukáže k rozhodnutí.
export function suspectedReceiptInvoiceDuplicates(ctx: FinanceContext): FinanceWarning[] {
  const normalize = (value: string | null) => value?.toLowerCase().replace(/\s+/g, " ").trim() || null;
  const invoicesByAmount = new Map<Halere, FinDocument[]>();
  for (const doc of ctx.active) {
    if (doc.docType !== "issued_invoice") continue;
    invoicesByAmount.set(doc.revenueWithVat, [...(invoicesByAmount.get(doc.revenueWithVat) ?? []), doc]);
  }
  const warnings: FinanceWarning[] = [];
  for (const receipt of ctx.active) {
    if (receipt.docType !== "sales_receipt" || ctx.supersededReceipts.has(receipt.externalId)) continue;
    for (const invoice of invoicesByAmount.get(receipt.revenueWithVat) ?? []) {
      const samePartner =
        (receipt.partnerIco !== null && receipt.partnerIco === invoice.partnerIco) ||
        (normalize(receipt.partnerName) !== null && normalize(receipt.partnerName) === normalize(invoice.partnerName));
      if (!samePartner || !receipt.dateOfIssue || !invoice.dateOfIssue) continue;
      const gap = daysBetween(receipt.dateOfIssue, invoice.dateOfIssue);
      if (gap < 0 || gap > 31) continue;
      warnings.push({
        code: "suspected_receipt_invoice_duplicate",
        message: `Možná duplicita: prodejka ${label(receipt)} a faktura ${label(invoice)} (${receipt.partnerName ?? receipt.partnerIco}, ${receipt.revenueWithVat / 100} Kč). Pokud jde o stejný prodej, propojte je — jinak se tržba počítá dvakrát.`,
        amount: receipt.revenueWithVat,
        documents: [receipt.externalId, invoice.externalId],
      });
    }
  }
  return warnings;
}

export function segmentLabel(segment: FinSegment): string {
  return SEGMENT_LABELS[segment];
}

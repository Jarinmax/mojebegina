// Finance 1.0 — normalizovaný doménový model. Tvar přesně odpovídá budoucím
// tabulkám fin_documents / fin_payments / fin_document_links (viz
// FINANCE_1_0.md) — schéma a migrace vzniknou až po sloučení Google
// Kalendáře do main, ale sémantika (klíče, znaménka, data) je daná už teď
// a pokrytá testy.
import type { Halere } from "./money";

export type FinSource = "idoklad";

// Druhy dokladů ve Finance 1.0. Zálohové faktury (proforma) se stahují
// jen kvůli vysvětlení úhrad — do tržby se nikdy nepočítají.
export type FinDocType =
  | "issued_invoice"
  | "credit_note"
  | "proforma_invoice"
  | "sales_receipt"
  | "received_invoice"
  | "received_receipt";

// "revenue" = prodejní strana (tržba, pohledávky), "cost" = nákupní strana
// (náklady, závazky). Zálohy jsou prodejní strana, ale bez vlivu na tržbu.
export type FinDirection = "revenue" | "cost";

export type FinPaymentStatus = "unpaid" | "paid" | "partially_paid" | "overpaid";

// Výchozí segmenty schválené vedením 4. 10. 2026. Přiřazení přes štítky
// iDokladu (viz segments.ts); "nezarazeno" se v cockpitu vždy ukazuje.
export type FinSegment =
  | "b2b_begina"
  | "eshop"
  | "bistro_jandl"
  | "akce"
  | "vyroba"
  | "rezie"
  | "nezarazeno";

// Datum ve formátu "YYYY-MM-DD" (účetní den, bez časové zóny) — iDoklad
// data dokladů posílá jako půlnoc bez zóny, čas tam nemá význam.
export type IsoDate = string;

export type FinDocument = {
  source: FinSource;
  docType: FinDocType;
  // Id dokladu v iDokladu (int) jako text — přirozený klíč spolu se
  // source + docType: UNIQUE(source, doc_type, external_id).
  externalId: string;
  direction: FinDirection;
  documentNumber: string | null;
  variableSymbol: string | null;
  orderNumber: string | null; // pole „Číslo objednávky“ v iDokladu
  partnerExternalId: string | null;
  partnerName: string | null;
  partnerIco: string | null;
  dateOfIssue: IsoDate | null;
  dateOfTaxing: IsoDate | null; // DUZP — uložené pro budoucí účetní pohled
  dateOfMaturity: IsoDate | null;
  dateOfPayment: IsoDate | null;
  dateOfReceiving: IsoDate | null;
  currencyId: number | null;
  exchangeRate: number | null;
  // Částky v CZK (pole *Hc z iDokladu) a v haléřích. ZNAMÉNKO JE
  // NORMALIZOVANÉ: dobropis je vždy záporný, ostatní doklady kladné.
  totalWithoutVat: Halere;
  totalVat: Halere;
  totalWithVat: Halere;
  // Hodnota prodeje PŘED odečtem zálohy (položky ItemTypeReduce). U faktury
  // bez zálohy = totalWithVat. Fakturovaná tržba se počítá z tohoto pole,
  // aby konečná faktura po záloze neukázala jen doplatek.
  revenueWithVat: Halere;
  revenueWithoutVat: Halere;
  totalPaid: Halere; // dle iDokladu (Prices.TotalPaidHc), stejné znaménko
  paymentStatus: FinPaymentStatus | null;
  // Dobropis → původní faktura (CreditedInvoiceId). Dohledatelnost vazby
  // je výslovné rozhodnutí vedení.
  creditedExternalId: string | null;
  // Zálohová faktura → konečná faktura, která zálohu vyúčtovala.
  accountedByInvoiceExternalId: string | null;
  // Konečná faktura → zálohy odečtené položkami ItemTypeReduce.
  deductedProformaExternalIds: string[];
  tagIds: number[];
  isDeleted: boolean;
  deletedAt: string | null;
  externalCreatedAt: string | null;
  externalChangedAt: string | null; // Metadata.DateLastChange
  // Úplný doklad z API — auditní podklad a možnost přepočtu bez nového
  // stahování. Nikdy neobsahuje přístupové údaje (jde o data dokladu).
  raw: unknown;
  contentHash: string;
};

export type FinPaymentSide = "issued" | "received";

export type FinPayment = {
  source: FinSource;
  side: FinPaymentSide;
  // Úhrady vydaných a přijatých dokladů mají v iDokladu samostatné číselné
  // řady id; prodejky nesou úhrady uvnitř dokladu → vlastní prefix.
  // UNIQUE(source, side, external_id).
  externalId: string;
  documentType: FinDocType;
  documentExternalId: string;
  dateOfPayment: IsoDate | null;
  // V CZK, haléře. Kladné = peníze k nám (u side "issued") / od nás
  // (u side "received"). Vratka k dobropisu je u side "issued" záporná.
  amount: Halere;
  paymentOptionId: number | null;
  bankStatementExternalId: string | null;
  cashVoucherExternalId: string | null;
  isDeleted: boolean;
  externalChangedAt: string | null;
  raw: unknown;
  contentHash: string;
};

// Ruční vazby. Ve V1 dvě použití:
//   "order"                — doklad ↔ objednávka MojeBegina (orders.id)
//   "receipt_in_invoice"   — prodejka byla později zahrnuta do (souhrnné)
//                            vydané faktury; iDoklad tuto vazbu v API v3
//                            nenese, proto ji zapisuje člověk (nebo ji
//                            cockpit navrhne jako „možnou duplicitu“).
export type FinDocumentLink =
  | {
      kind: "order";
      documentExternalId: string;
      docType: FinDocType;
      orderId: string;
      matchMethod: "variable_symbol" | "order_number" | "document_number" | "manual";
    }
  | {
      kind: "receipt_in_invoice";
      receiptExternalId: string;
      invoiceExternalId: string;
    };

// Pohyb na účtu nebo v pokladně. Ve V1 se ze iDokladu NESTAHUJE (banka
// a pokladna jsou zatím neověřené agendy), ale pravidlo proti dvojímu
// započtení existuje a je otestované už teď, aby ho nebylo nutné vymýšlet
// při napojení banky.
export type FinCashMovement = {
  source: FinSource | "bank" | "stripe";
  kind: "bank" | "cash";
  externalId: string;
  date: IsoDate;
  amount: Halere; // + příjem, − výdaj
  // Spárováno s úhradou / prodejkou / souhrnným dokladem prodejek → peníze
  // už jsou započtené jinde a pohyb se přeskočí.
  isPairedToDocument: boolean;
};

export type VatMode = "non_payer" | "payer";

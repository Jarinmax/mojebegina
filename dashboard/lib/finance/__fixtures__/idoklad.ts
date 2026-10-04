// Finance 1.0 — fixture data ve TVARU odpovědí iDoklad API v3 (pole podle
// oficiálního SDK, výčty jako čísla). Fiktivní firmy a částky; slouží
// testům a režimu „fixture“ v Preview (bez přístupu k iDokladu).
//
// Ručně spočítané očekávané hodnoty (neplátce DPH, „dnes“ = 15. 10. 2026)
// jsou v FIXTURE_EXPECTED níže — testy je ověřují 1:1.
import type {
  ApiAgenda,
  ApiCreditNote,
  ApiIssuedDocumentPayment,
  ApiIssuedInvoice,
  ApiProformaInvoice,
  ApiReceivedDocumentPayment,
  ApiReceivedInvoice,
  ApiReceivedReceipt,
  ApiSalesReceipt,
  ApiTag,
} from "../idoklad/apiTypes";

export const FIXTURE_NOW = new Date("2026-10-15T10:00:00Z"); // 12:00 v Praze
export const FIXTURE_COMPANY_ICO = "12345678";

export const fixtureAgenda: ApiAgenda = {
  Id: 7001,
  Name: "Testovací agenda Begina",
  VatRegistrationType: 0, // NotVatPayer
  IsRegisteredForVat: false,
  DefaultCurrencyId: 1,
  Contact: { IdentificationNumber: "87654321" },
};

export const fixtureTags: ApiTag[] = [
  { Id: 1, Name: "B2B Begina" },
  { Id: 2, Name: "E-shop" },
  { Id: 3, Name: "Bistro Jandl" },
  { Id: 4, Name: "Akce" },
  { Id: 5, Name: "Výroba" },
  { Id: 6, Name: "Režie" },
  { Id: 7, Name: "Stálý zákazník" }, // nesegmentový štítek
];

const meta = (changed: string) => ({ DateCreated: changed, DateLastChange: changed });
const EMPTY = "1753-01-01T00:00:00";

function invoice(
  id: number,
  fields: Partial<ApiIssuedInvoice> & { total: number; paid?: number; status: number; tags?: number[] }
): ApiIssuedInvoice {
  const { total, paid = 0, status, tags = [], ...rest } = fields;
  return {
    Id: id,
    DocumentNumber: `2026${String(id).padStart(4, "0")}`,
    VariableSymbol: `2026${String(id).padStart(4, "0")}`,
    CurrencyId: 1,
    ExchangeRate: 1,
    DateOfPayment: EMPTY,
    PaymentStatus: status,
    Prices: { TotalWithoutVatHc: total, TotalVatHc: 0, TotalWithVatHc: total, TotalPaidHc: paid },
    Items: [{ Id: id * 10, ItemType: 0, Name: "Nápoje", Prices: { TotalWithVatHc: total, TotalWithoutVatHc: total } }],
    Tags: tags.map((TagId) => ({ TagId })),
    Metadata: meta(`${rest.DateOfIssue ?? "2026-10-01T00:00:00"}`.replace("T00:00:00", "T09:00:00.000")),
    ...rest,
  };
}

export const fixtureIssuedInvoices: ApiIssuedInvoice[] = [
  invoice(101, {
    PartnerAddress: { CompanyName: "The Cup s.r.o.", IdentificationNumber: "99999999" },
    DateOfIssue: "2026-09-03T00:00:00",
    DateOfTaxing: "2026-09-03T00:00:00",
    DateOfMaturity: "2026-09-17T00:00:00",
    DateOfPayment: "2026-09-10T00:00:00",
    total: 1137,
    paid: 1137,
    status: 1,
    tags: [1],
  }),
  invoice(102, {
    PartnerAddress: { CompanyName: "Café Alfa", IdentificationNumber: "11111111" },
    DateOfIssue: "2026-09-20T00:00:00",
    DateOfTaxing: "2026-09-20T00:00:00",
    DateOfMaturity: "2026-10-04T00:00:00",
    total: 5000,
    status: 0,
    tags: [1],
  }),
  invoice(103, {
    PartnerAddress: { CompanyName: "Restaurace Beta", IdentificationNumber: "55555555" },
    DateOfIssue: "2026-10-02T00:00:00",
    DateOfTaxing: "2026-10-02T00:00:00",
    DateOfMaturity: "2026-10-16T00:00:00",
    total: 3000,
    paid: 1000,
    status: 2,
    tags: [1, 7],
  }),
  // Konečná faktura po záloze 201: prodej 10 000, odečet zálohy −4 000.
  {
    ...invoice(104, {
      PartnerAddress: { CompanyName: "Pivní slavnosti z.s.", IdentificationNumber: "66666666" },
      DateOfIssue: "2026-10-06T00:00:00",
      DateOfTaxing: "2026-10-06T00:00:00",
      DateOfMaturity: "2026-10-20T00:00:00",
      DateOfPayment: "2026-10-08T00:00:00",
      total: 6000,
      paid: 6000,
      status: 1,
      tags: [4],
    }),
    Items: [
      { Id: 1041, ItemType: 0, Name: "Svařák na akci", Prices: { TotalWithVatHc: 10000, TotalWithoutVatHc: 10000 } },
      {
        Id: 1042,
        ItemType: 2, // ItemTypeReduce — odpočet zálohy
        InvoiceProformaId: 201,
        Name: "Odpočet zálohy",
        Prices: { TotalWithVatHc: -4000, TotalWithoutVatHc: -4000 },
      },
    ],
  },
  invoice(105, {
    PartnerAddress: { Firstname: "Jan", Surname: "Novák" },
    DateOfIssue: "2026-10-10T00:00:00",
    DateOfTaxing: "2026-10-10T00:00:00",
    DateOfMaturity: "2026-10-24T00:00:00",
    total: 1500,
    status: 0,
    tags: [2],
  }),
  invoice(106, {
    PartnerAddress: { CompanyName: "Hotel Gama", IdentificationNumber: "22222222" },
    DateOfIssue: "2026-09-25T00:00:00",
    DateOfTaxing: "2026-09-25T00:00:00",
    DateOfMaturity: "2026-10-09T00:00:00",
    DateOfPayment: "2026-09-28T00:00:00",
    total: 8000,
    paid: 8000,
    status: 1,
    tags: [1],
  }),
  invoice(107, {
    PartnerAddress: { CompanyName: "Festival Delta" },
    DateOfIssue: "2026-10-14T00:00:00",
    DateOfTaxing: "2026-10-14T00:00:00",
    DateOfMaturity: "2026-10-28T00:00:00",
    total: 2500,
    status: 0,
    tags: [], // → Nezařazeno
  }),
  // Faktura v EUR: 100 EUR × 25 = 2 500 Kč (počítá se jen z *Hc).
  {
    ...invoice(109, {
      PartnerAddress: { CompanyName: "Wiener Kaffee GmbH" },
      DateOfIssue: "2026-10-09T00:00:00",
      DateOfTaxing: "2026-10-09T00:00:00",
      DateOfMaturity: "2026-10-23T00:00:00",
      DateOfPayment: "2026-10-11T00:00:00",
      total: 2500,
      paid: 2500,
      status: 1,
      tags: [1],
    }),
    CurrencyId: 2,
    ExchangeRate: 25,
  },
  // Souhrnná faktura, do které byla zahrnuta prodejka 401 (stejný prodej).
  invoice(110, {
    PartnerAddress: { CompanyName: "Firma Epsilon", IdentificationNumber: "33333333" },
    DateOfIssue: "2026-10-07T00:00:00",
    DateOfTaxing: "2026-10-07T00:00:00",
    DateOfMaturity: "2026-10-21T00:00:00",
    DateOfPayment: "2026-10-07T00:00:00",
    total: 450,
    paid: 450,
    status: 1,
    tags: [3],
  }),
];

export const fixtureCreditNotes: ApiCreditNote[] = [
  // Plný dobropis k neuhrazené faktuře 105 — iDoklad posílá kladnou částku.
  {
    Id: 301,
    DocumentNumber: "D20260001",
    CreditedInvoiceId: 105,
    CreditNoteReason: "Vrácené zboží",
    PartnerAddress: { Firstname: "Jan", Surname: "Novák" },
    DateOfIssue: "2026-10-12T00:00:00",
    DateOfTaxing: "2026-10-12T00:00:00",
    DateOfMaturity: "2026-10-26T00:00:00",
    PaymentStatus: 0,
    Prices: { TotalWithoutVatHc: 1500, TotalVatHc: 0, TotalWithVatHc: 1500, TotalPaidHc: 0 },
    Tags: [],
    Metadata: meta("2026-10-12T09:00:00.000"),
  },
  // Částečný dobropis k uhrazené faktuře 106 — záporná částka, vráceno 2 000.
  {
    Id: 302,
    DocumentNumber: "D20260002",
    CreditedInvoiceId: 106,
    CreditNoteReason: "Sleva za reklamaci",
    PartnerAddress: { CompanyName: "Hotel Gama", IdentificationNumber: "22222222" },
    DateOfIssue: "2026-10-03T00:00:00",
    DateOfTaxing: "2026-10-03T00:00:00",
    DateOfMaturity: "2026-10-17T00:00:00",
    PaymentStatus: 1,
    Prices: { TotalWithoutVatHc: -2000, TotalVatHc: 0, TotalWithVatHc: -2000, TotalPaidHc: -2000 },
    Tags: [],
    Metadata: meta("2026-10-05T09:00:00.000"),
  },
];

export const fixtureProformaInvoices: ApiProformaInvoice[] = [
  {
    Id: 201,
    DocumentNumber: "Z20260001",
    AccountedByInvoiceId: 104,
    PartnerAddress: { CompanyName: "Pivní slavnosti z.s.", IdentificationNumber: "66666666" },
    DateOfIssue: "2026-09-28T00:00:00",
    DateOfMaturity: "2026-10-05T00:00:00",
    DateOfPayment: "2026-09-30T00:00:00",
    PaymentStatus: 1,
    Prices: { TotalWithoutVatHc: 4000, TotalVatHc: 0, TotalWithVatHc: 4000, TotalPaidHc: 4000 },
    Tags: [{ TagId: 4 }],
    Metadata: meta("2026-09-30T09:00:00.000"),
  },
];

export const fixtureSalesReceipts: ApiSalesReceipt[] = [
  {
    Id: 401,
    DocumentNumber: "P20260001",
    PartnerAddress: { CompanyName: "Firma Epsilon", IdentificationNumber: "33333333" },
    DateOfIssue: "2026-10-07T00:00:00",
    IsAccounted: true,
    Prices: { TotalWithoutVatHc: 450, TotalVatHc: 0, TotalWithVatHc: 450 },
    Payments: [{ Id: 1, PaymentOptionId: 2, Prices: { PaymentAmountHc: 450 } }],
    Tags: [{ TagId: 3 }],
    Metadata: meta("2026-10-07T12:00:00.000"),
  },
  {
    Id: 402,
    DocumentNumber: "P20260002",
    DateOfIssue: "2026-10-14T00:00:00",
    Prices: { TotalWithoutVatHc: 320, TotalVatHc: 0, TotalWithVatHc: 320 },
    Payments: [{ Id: 2, PaymentOptionId: 2, Prices: { PaymentAmountHc: 320 } }],
    Tags: [{ TagId: 3 }],
    Metadata: meta("2026-10-14T12:00:00.000"),
  },
  // Stejný partner a částka jako faktura 102, 5 dní předtím, BEZ vazby →
  // cockpit musí ukázat „možnou duplicitu“.
  {
    Id: 403,
    DocumentNumber: "P20260003",
    PartnerAddress: { CompanyName: "Café Alfa", IdentificationNumber: "11111111" },
    DateOfIssue: "2026-09-15T00:00:00",
    Prices: { TotalWithoutVatHc: 5000, TotalVatHc: 0, TotalWithVatHc: 5000 },
    Payments: [{ Id: 3, PaymentOptionId: 1, Prices: { PaymentAmountHc: 5000 } }],
    Tags: [{ TagId: 1 }],
    Metadata: meta("2026-09-15T12:00:00.000"),
  },
];

export const fixtureReceivedInvoices: ApiReceivedInvoice[] = [
  {
    Id: 501,
    DocumentNumber: "PF20260001",
    ReceivedDocumentNumber: "FV-2026-881",
    PartnerAddress: { CompanyName: "Sirupy Morava s.r.o.", IdentificationNumber: "44444444" },
    DateOfIssue: "2026-09-10T00:00:00",
    DateOfReceiving: "2026-09-11T00:00:00",
    DateOfMaturity: "2026-09-24T00:00:00",
    DateOfPayment: "2026-09-20T00:00:00",
    PaymentStatus: 1,
    Prices: { TotalWithoutVatHc: 9917.36, TotalVatHc: 2082.64, TotalWithVatHc: 12000, TotalPaidHc: 12000 },
    Tags: [{ TagId: 5 }],
    Metadata: meta("2026-09-20T09:00:00.000"),
  },
  {
    Id: 502,
    DocumentNumber: "PF20260002",
    PartnerAddress: { CompanyName: "Obaly CZ" },
    DateOfIssue: "2026-10-01T00:00:00",
    DateOfReceiving: "2026-10-02T00:00:00",
    DateOfMaturity: "2026-10-10T00:00:00",
    PaymentStatus: 0,
    Prices: { TotalWithoutVatHc: 2892.56, TotalVatHc: 607.44, TotalWithVatHc: 3500, TotalPaidHc: 0 },
    Tags: [{ TagId: 5 }],
    Metadata: meta("2026-10-02T09:00:00.000"),
  },
  {
    Id: 503,
    DocumentNumber: "PF20260003",
    PartnerAddress: { CompanyName: "Pronajímatel a.s." },
    DateOfIssue: "2026-10-01T00:00:00",
    DateOfReceiving: "2026-10-01T00:00:00",
    DateOfMaturity: "2026-10-20T00:00:00",
    PaymentStatus: 2,
    Prices: { TotalWithoutVatHc: 8000, TotalVatHc: 0, TotalWithVatHc: 8000, TotalPaidHc: 5000 },
    Tags: [{ TagId: 6 }],
    Metadata: meta("2026-10-05T09:00:00.000"),
  },
];

export const fixtureReceivedReceipts: ApiReceivedReceipt[] = [
  {
    Id: 601,
    DocumentNumber: "U20260001",
    Partner: { CompanyName: "Benzina" },
    DateOfIssue: "2026-10-03T00:00:00",
    CashVoucherId: 8101,
    Prices: { TotalWithoutVatHc: 991.74, TotalVatHc: 208.26, TotalWithVatHc: 1200 },
    Tags: [{ TagId: 4 }],
    Metadata: meta("2026-10-03T09:00:00.000"),
  },
  {
    Id: 602,
    DocumentNumber: "U20260002",
    Partner: { CompanyName: "Papírnictví" },
    DateOfIssue: "2026-09-12T00:00:00",
    Prices: { TotalWithoutVatHc: 247.93, TotalVatHc: 52.07, TotalWithVatHc: 300 },
    Tags: [],
    Metadata: meta("2026-09-12T09:00:00.000"),
  },
];

export const fixtureIssuedPayments: ApiIssuedDocumentPayment[] = [
  { Id: 1001, InvoiceId: 101, DocumentType: 0, DateOfPayment: "2026-09-10T00:00:00", BankStatementId: 9001, Prices: { PaymentAmountHc: 1137 } },
  { Id: 1002, InvoiceId: 201, DocumentType: 1, DateOfPayment: "2026-09-30T00:00:00", BankStatementId: 9002, Prices: { PaymentAmountHc: 4000 } },
  { Id: 1003, InvoiceId: 103, DocumentType: 0, DateOfPayment: "2026-10-05T00:00:00", CashVoucherId: 8001, Prices: { PaymentAmountHc: 1000 } },
  { Id: 1004, InvoiceId: 104, DocumentType: 0, DateOfPayment: "2026-10-08T00:00:00", Prices: { PaymentAmountHc: 6000 } },
  { Id: 1006, InvoiceId: 106, DocumentType: 0, DateOfPayment: "2026-09-28T00:00:00", Prices: { PaymentAmountHc: 8000 } },
  // Vratka k dobropisu 302 — iDoklad ji může poslat kladně; normalizace ji otočí.
  { Id: 1007, InvoiceId: 302, DocumentType: 3, DateOfPayment: "2026-10-05T00:00:00", Prices: { PaymentAmountHc: 2000 } },
  { Id: 1009, InvoiceId: 109, DocumentType: 0, DateOfPayment: "2026-10-11T00:00:00", Prices: { PaymentAmountHc: 2500 } },
  // Úhrada souhrnné faktury 110 — tytéž peníze už přišly na prodejku 401.
  { Id: 1010, InvoiceId: 110, DocumentType: 0, DateOfPayment: "2026-10-07T00:00:00", Prices: { PaymentAmountHc: 450 } },
  // Úhrada prodejky v seznamu úhrad — přeskočí se (čte se z prodejky).
  { Id: 1011, InvoiceId: 402, DocumentType: 6, DateOfPayment: "2026-10-14T00:00:00", Prices: { PaymentAmountHc: 320 } },
  // Úhrada k dokladu, který nebyl stažen → varování, nezapočítá se.
  { Id: 1012, InvoiceId: 999, DocumentType: 0, DateOfPayment: "2026-10-01T00:00:00", Prices: { PaymentAmountHc: 777 } },
];

export const fixtureReceivedPayments: ApiReceivedDocumentPayment[] = [
  {
    Id: 2001,
    InvoiceId: 501,
    DateOfPayment: "2026-09-20T00:00:00",
    PaymentDocument: { DocumentType: 4, Id: 9101 },
    Prices: { PaymentAmountHc: 12000 },
  },
  { Id: 2002, InvoiceId: 503, DateOfPayment: "2026-10-05T00:00:00", Prices: { PaymentAmountHc: 5000 } },
];

// Ručně spočítané hodnoty pro neplátce DPH k 15. 10. 2026 (v Kč).
export const FIXTURE_EXPECTED = {
  invoicedRevenue: {
    // 3000 + 10000 + 1500 + 2500 + 2500 + 450 − 1500 − 2000 + 320
    october: 16_770,
    // 1137 + 5000 + 8000 + 5000 (prodejka 403); záloha 201 se nepočítá
    september: 19_137,
    today: 0,
    octoberBySegment: { b2b_begina: 3_500, akce: 10_000, eshop: 0, bistro_jandl: 770, nezarazeno: 2_500 },
  },
  paidRevenue: {
    // 1000 + 6000 − 2000 + 2500 + 0 (zkráceno) + 450 + 320
    october: 8_270,
    // 1137 + 4000 (záloha) + 8000 + 5000
    september: 18_137,
  },
  costs: { october: 12_700, september: 12_300 },
  cash: {
    october: { cashIn: 8_270, cashOut: 6_200, net: 2_070 },
    september: { cashIn: 18_137, cashOut: 12_300, net: 5_837 },
  },
  receivables: { total: 9_500, overdueTotal: 5_000, count: 3, overdueCount: 1 },
  payables: { total: 6_500, overdueTotal: 3_500, count: 2, overdueCount: 1 },
} as const;

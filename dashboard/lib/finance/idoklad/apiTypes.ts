// Finance 1.0 — podmnožina tvarů odpovědí iDoklad API v3, kterou Finance
// čte. Názvy polí přesně podle oficiálního SDK (Models/*/List/*GetModel.cs).
// Všechna pole jsou volitelná: normalizace nesmí spadnout, když iDoklad
// pole vynechá, a chybějící povinné pole hlásí jako invalid_response.
//
// Výčtové hodnoty (PaymentStatus, ItemType, …) SDK serializuje jako čísla;
// normalizace přijímá číslo i textový název, aby změna serializace
// neposunula význam.

export type ApiEnum = number | string;

export type ApiMetadata = {
  DateCreated?: string | null;
  DateLastChange?: string | null;
};

export type ApiInvoicePrices = {
  TotalWithoutVatHc?: number | null;
  TotalVatHc?: number | null;
  TotalWithVatHc?: number | null;
  TotalPaidHc?: number | null;
};

export type ApiItemPrices = {
  TotalWithoutVatHc?: number | null;
  TotalVatHc?: number | null;
  TotalWithVatHc?: number | null;
};

export type ApiInvoiceItem = {
  Id?: number;
  ItemType?: ApiEnum; // 0 Normal, 1 Round, 2 Reduce (odpočet zálohy), 3 Discount
  InvoiceProformaId?: number | null;
  Name?: string | null;
  Prices?: ApiItemPrices | null;
};

export type ApiAddress = {
  NickName?: string | null;
  CompanyName?: string | null;
  Firstname?: string | null;
  Surname?: string | null;
  IdentificationNumber?: string | null;
};

export type ApiTagRef = { TagId?: number };

type ApiDocumentBase = {
  Id?: number;
  DocumentNumber?: string | null;
  VariableSymbol?: string | null;
  OrderNumber?: string | null;
  PartnerId?: number | null;
  PartnerAddress?: ApiAddress | null;
  Partner?: ApiAddress | null;
  DateOfIssue?: string | null;
  DateOfTaxing?: string | null;
  DateOfMaturity?: string | null;
  DateOfPayment?: string | null;
  DateOfReceiving?: string | null;
  CurrencyId?: number | null;
  ExchangeRate?: number | null;
  PaymentStatus?: ApiEnum | null;
  Prices?: ApiInvoicePrices | null;
  Items?: ApiInvoiceItem[] | null;
  Tags?: ApiTagRef[] | null;
  Metadata?: ApiMetadata | null;
};

export type ApiIssuedInvoice = ApiDocumentBase;
export type ApiCreditNote = ApiDocumentBase & { CreditedInvoiceId?: number | null; CreditNoteReason?: string | null };
export type ApiProformaInvoice = ApiDocumentBase & { AccountedByInvoiceId?: number | null };
export type ApiReceivedInvoice = ApiDocumentBase & { ReceivedDocumentNumber?: string | null };
export type ApiReceivedReceipt = ApiDocumentBase & {
  BankStatementId?: number | null;
  CashVoucherId?: number | null;
  ExternalDocumentNumber?: string | null;
};

export type ApiSalesReceiptPayment = {
  Id?: number;
  PaymentOptionId?: number | null;
  Prices?: { PaymentAmountHc?: number | null } | null;
  Metadata?: ApiMetadata | null;
};

export type ApiSalesReceipt = ApiDocumentBase & {
  IsAccounted?: boolean | null;
  ExternalDocumentNumber?: string | null;
  Payments?: ApiSalesReceiptPayment[] | null;
};

export type ApiIssuedDocumentPayment = {
  Id?: number;
  InvoiceId?: number;
  DocumentType?: ApiEnum; // DocumentType: 0 IssuedInvoice, 1 ProformaInvoice, 3 CreditNote, 6 SalesReceipt …
  DateOfPayment?: string | null;
  PaymentOptionId?: number | null;
  BankStatementId?: number | null;
  CashVoucherId?: number | null;
  Prices?: { PaymentAmountHc?: number | null } | null;
  Metadata?: ApiMetadata | null;
};

export type ApiReceivedDocumentPayment = {
  Id?: number;
  InvoiceId?: number;
  DateOfPayment?: string | null;
  PaymentOptionId?: number | null;
  PaymentDocument?: { DocumentType?: ApiEnum; Id?: number } | null; // 2 CashVoucher, 4 BankStatement
  Prices?: { PaymentAmountHc?: number | null } | null;
  Metadata?: ApiMetadata | null;
};

export type ApiTag = { Id?: number; Name?: string | null };

/** Číselná řada (GET /NumericSequences) — jen pole, která výpis ukazuje. */
export type ApiNumericSequence = {
  Id?: number;
  Name?: string | null;
  NumberFormat?: string | null;
  DocumentType?: ApiEnum; // 0 = vydané faktury (ostatní hodnoty se ukazují číslem)
  IsDefault?: boolean | null;
  LastNumber?: number | null;
  Year?: number | null;
};

export type ApiAgenda = {
  Id?: number;
  Name?: string | null;
  VatRegistrationType?: ApiEnum; // 0 NotVatPayer, 1 VatPayer, 2 IdentifiedPersonVat
  IsRegisteredForVat?: boolean | null;
  DefaultCurrencyId?: number | null;
  PreferredPriceType?: ApiEnum | null; // 0 WithVat, 1 WithoutVat, 2 OnlyBase
  PreferredVatRate?: ApiEnum | null;
  Contact?: { IdentificationNumber?: string | null; VatIdentificationNumber?: string | null } | null;
  // SubscriptionType: 0 Free, 1 Basic, 2 Standard, 3 Premium
  Subscription?: { Type?: ApiEnum | null; IsTrial?: boolean | null; DateTo?: string | null } | null;
};

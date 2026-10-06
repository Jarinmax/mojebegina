// ESHOP 1.0 — převod návrhu faktury (InvoiceDraft) na požadavky iDokladu
// API v3. Čisté funkce, ŽÁDNÁ síť.
//
//   idokladRequests(draft)   náhled pro MojeBegina (uloží se k návrhu);
//                            ID z číselníků iDokladu (kontakt, měna, způsob
//                            úhrady, pořadové číslo) doplní až ostré
//                            vystavení — tady jsou null,
//   contactPostBody(…)       tělo POST /Contacts (ostré vystavení),
//   invoicePostBody(…)       tělo POST /IssuedInvoices (ostré vystavení).
//
// Pole a povinnost podle oficiálního SDK Solitea/IdokladSdk 5.4.0
// (ContactPostModel, IssuedInvoicePostModel, IssuedInvoiceItemPostModel;
// ověřeno 7. 10. 2026). Výčty se posílají jako čísla (SDK nepoužívá
// převod na text), data jako „yyyy-MM-ddTHH:mm:ss.fff“ — posíláme poledne,
// aby se den nikdy neposunul převodem časového pásma.
import type { InvoiceDraft } from "./draft";

export const IDOKLAD_PROVIDER = "idoklad";

/** iDoklad API v3 výčty (IdokladSdk/Enums). */
export const IDOKLAD_ENUMS = {
  PriceType: { WithVat: 0, WithoutVat: 1, OnlyBase: 2 },
  VatRateType: { Reduced1: 0, Basic: 1, Zero: 2, Reduced2: 3 },
  IssuedInvoiceItemType: { Normal: 0 },
  PaymentStatus: { Unpaid: 0, Paid: 1, PartialPaid: 2, Overpaid: 3 },
  Language: { Cz: 1 },
} as const;

/** Pořadí kroků ostrého vystavení (přehled v MojeBegina; provádí issue.ts). */
export const IDOKLAD_ISSUE_STEPS = [
  "Ověřit agendu (IČO Beginy, neplátce DPH) a řadu 7277293 „E-shop Begina“ (vydané faktury, není výchozí).",
  "Pojistka proti dvojí faktuře: vyhledat vydanou fakturu s tímto VS — když existuje, jen ji připojit, nic nevystavovat.",
  "Najít kontakt v iDokladu (firma podle IČO, jinak podle e-mailu); když neexistuje, založit ho.",
  "Vystavit fakturu v řadě E-shop Begina (POST IssuedInvoices) — bez e-mailu z iDokladu.",
  "Označit fakturu jako uhrazenou (peníze už přišly) a ověřit částku i stav úhrady.",
  "Stáhnout PDF a poslat ho zákazníkovi z MojeBegina (e-mail „Platbu jsme přijali“).",
] as const;

const MAX_CODE = 20; // IssuedInvoiceItemPostModel.Code [StringLength(20)]
const MAX_NAME = 200;

export function splitName(name: string | null): { firstname: string | null; surname: string | null } {
  if (!name) return { firstname: null, surname: null };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstname: null, surname: parts[0] };
  return { firstname: parts.slice(0, -1).join(" "), surname: parts.at(-1)! };
}

/** YYYY-MM-DD → formát data iDokladu (poledne, beze změny dne). */
export function idokladDate(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Neplatné datum ${day}`);
  return `${day}T12:00:00.000`;
}

export type ItemPricing = { priceType: number; vatRateType: number };

/** Způsob úhrady v MojeBegina → jak ho poznat v číselníku PaymentOptions iDokladu. */
export const PAYMENT_OPTION_MATCH: Record<string, { label: string; name: RegExp }> = {
  bank_transfer: { label: "převodem", name: /p[řr]evod/i },
  card: { label: "kartou", name: /kart/i },
  cash: { label: "hotově", name: /hotov/i },
};

export type IdokladRequests = {
  contactLookup: { by: "ico" | "email"; value: string | null };
  contact: Record<string, unknown>;
  duplicateCheck: { collection: "IssuedInvoices"; filter: string | null };
  invoice: Record<string, unknown>;
};

export type ContactResolved = { countryId: number };

export function contactPostBody(draft: InvoiceDraft, resolved: ContactResolved): Record<string, unknown> {
  const { firstname, surname } = splitName(draft.customer.name);
  const address = draft.customer.address;
  return {
    CompanyName: (draft.customer.name ?? draft.customer.email ?? "").slice(0, 200), // u osoby celé jméno
    Firstname: firstname,
    Surname: surname,
    Email: draft.customer.email,
    Phone: draft.customer.phone,
    Street: address?.street ?? null,
    City: address?.city ?? null,
    PostalCode: address?.zip ?? null,
    CountryId: resolved.countryId,
  };
}

export type InvoiceResolved = {
  partnerId: number;
  numericSequenceId: number;
  documentSerialNumber: number;
  currencyId: number;
  paymentOptionId: number;
  pricing: ItemPricing;
};

function items(draft: InvoiceDraft, pricing: ItemPricing | null) {
  return draft.lines.map((line) => ({
    Name: line.name.slice(0, MAX_NAME),
    Code: line.sku && line.sku.length <= MAX_CODE ? line.sku : null,
    Amount: line.quantity,
    Unit: line.kind === "item" ? "ks" : null,
    UnitPrice: line.unitPriceKc,
    PriceType: pricing?.priceType ?? null,
    VatRateType: pricing?.vatRateType ?? null,
    DiscountPercentage: 0,
    IsTaxMovement: false,
    ItemType: IDOKLAD_ENUMS.IssuedInvoiceItemType.Normal,
  }));
}

/**
 * Tělo POST /IssuedInvoices. `defaults` = výsledek GET /IssuedInvoices/Default
 * (nastavení agendy: bankovní účet, konstantní symbol, …) — převezmou se jen
 * pole PostModelu, naše hodnoty mají vždy přednost.
 */
export function invoicePostBody(
  draft: InvoiceDraft,
  resolved: InvoiceResolved,
  defaults: Record<string, unknown> = {}
): Record<string, unknown> {
  if (!draft.vs || !draft.issueDate) throw new Error("Návrh faktury nemá VS nebo datum úhrady.");
  const fromDefaults: Record<string, unknown> = {};
  for (const key of ["AccountNumber", "BankId", "Iban", "Swift", "ConstantSymbolId", "IsIncomeTax", "ItemsTextPrefix", "ItemsTextSuffix"]) {
    if (defaults[key] !== undefined && defaults[key] !== null) fromDefaults[key] = defaults[key];
  }
  const date = idokladDate(draft.issueDate);
  return {
    IsIncomeTax: true,
    ...fromDefaults,
    PartnerId: resolved.partnerId,
    NumericSequenceId: resolved.numericSequenceId,
    DocumentSerialNumber: resolved.documentSerialNumber,
    VariableSymbol: draft.vs,
    DateOfIssue: date,
    DateOfTaxing: date,
    DateOfMaturity: date,
    CurrencyId: resolved.currencyId,
    PaymentOptionId: resolved.paymentOptionId,
    OrderNumber: draft.orderNumber !== null ? String(draft.orderNumber) : null,
    Description: draft.note,
    DiscountPercentage: 0,
    IsEet: false,
    ReportLanguage: IDOKLAD_ENUMS.Language.Cz,
    Items: items(draft, resolved.pricing),
  };
}

/** Náhled pro MojeBegina: co se do iDokladu pošle (ID z číselníků doplní ostré vystavení). */
export function idokladRequests(draft: InvoiceDraft): IdokladRequests {
  return {
    contactLookup: { by: "email", value: draft.customer.email },
    contact: { ...contactPostBody(draft, { countryId: 0 }), CountryId: null },
    duplicateCheck: { collection: "IssuedInvoices", filter: draft.vs ? `VariableSymbol~eq~${draft.vs}` : null },
    invoice: {
      PartnerId: null, // ID kontaktu z kroku „kontakt“
      NumericSequenceId: draft.numberSeriesId,
      DocumentSerialNumber: null, // přidělí iDoklad (NumericSequences/DocumentNumbers)
      VariableSymbol: draft.vs,
      DateOfIssue: draft.issueDate,
      DateOfTaxing: draft.taxableDate,
      DateOfMaturity: draft.dueDate,
      CurrencyId: null, // CZK — z číselníku Currencies
      PaymentOptionId: null, // podle způsobu úhrady — z číselníku PaymentOptions
      OrderNumber: draft.orderNumber !== null ? String(draft.orderNumber) : null,
      Description: draft.note,
      IsEet: false,
      Items: items(draft, null).map((item) => ({
        Name: item.Name,
        Code: item.Code,
        Amount: item.Amount,
        Unit: item.Unit,
        UnitPrice: item.UnitPrice,
      })),
    },
  };
}

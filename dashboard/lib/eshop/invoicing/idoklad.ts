// ESHOP 1.0 — převod návrhu faktury (InvoiceDraft) na požadavky iDokladu
// API v3. Čistá funkce, ŽÁDNÁ síť: výsledek se v režimu návrhu jen uloží
// (invoice_provider_links.request_payload) a ukáže v MojeBegina.
//
// Názvy polí podle oficiálního SDK Solitea/IdokladSdk (ContactPostModel,
// IssuedInvoicePostModel, IssuedInvoiceItemPostModel). PŘED ostrým
// zapnutím je ověřit, stejně jako číselná ID (země, měna, způsob úhrady),
// která tu zatím jsou null — viz problém „verify_idoklad_fields“.
import type { InvoiceDraft } from "./draft";

export const IDOKLAD_PROVIDER = "idoklad";

/** Pořadí kroků ostrého vystavení (pro přehled v MojeBegina a pro budoucí live provider). */
export const IDOKLAD_ISSUE_STEPS = [
  "Najít kontakt v iDokladu podle e-mailu (u firmy podle IČO); když neexistuje, založit ho.",
  "Pojistka proti dvojí faktuře: vyhledat vydanou fakturu s tímto VS — když existuje, jen ji připojit, nic nevystavovat.",
  "Vystavit fakturu v e-shopové číselné řadě (POST IssuedInvoices), bez e-mailu z iDokladu.",
  "Označit fakturu jako uhrazenou (peníze už přišly).",
  "Stáhnout PDF a poslat ho zákazníkovi z MojeBegina (e-mail „Platbu jsme přijali“).",
] as const;

function splitName(name: string | null): { firstname: string | null; surname: string | null } {
  if (!name) return { firstname: null, surname: null };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstname: null, surname: parts[0] };
  return { firstname: parts.slice(0, -1).join(" "), surname: parts.at(-1)! };
}

export type IdokladRequests = {
  contactLookup: { by: "email"; value: string | null };
  contact: Record<string, unknown>;
  duplicateCheck: { collection: "IssuedInvoices"; filter: string | null };
  invoice: Record<string, unknown>;
};

export function idokladRequests(draft: InvoiceDraft): IdokladRequests {
  const { firstname, surname } = splitName(draft.customer.name);
  const address = draft.customer.address;
  return {
    contactLookup: { by: "email", value: draft.customer.email },
    contact: {
      CompanyName: draft.customer.name, // u soukromé osoby celé jméno
      Firstname: firstname,
      Surname: surname,
      Email: draft.customer.email,
      Phone: draft.customer.phone,
      Street: address?.street ?? null,
      City: address?.city ?? null,
      PostalCode: address?.zip ?? null,
      CountryId: null, // ČR — ID z číselníku iDokladu (ověřit)
    },
    duplicateCheck: { collection: "IssuedInvoices", filter: draft.vs ? `VariableSymbol~eq~${draft.vs}` : null },
    invoice: {
      PartnerId: null, // ID kontaktu z prvního kroku
      NumericSequenceId: draft.numberSeriesId,
      VariableSymbol: draft.vs,
      DateOfIssue: draft.issueDate,
      DateOfTaxing: draft.taxableDate,
      DateOfMaturity: draft.dueDate,
      DateOfPayment: draft.issueDate,
      CurrencyId: null, // CZK — ID z číselníku iDokladu (ověřit)
      PaymentOptionId: null, // podle draft.paymentMethod — ID z číselníku iDokladu (ověřit)
      OrderNumber: draft.orderNumber !== null ? String(draft.orderNumber) : null,
      Description: draft.note,
      IsEet: false,
      Items: draft.lines.map((line) => ({
        Name: line.name,
        Code: line.sku,
        Amount: line.quantity,
        Unit: line.kind === "item" ? "ks" : null,
        UnitPrice: line.unitPriceKc,
        PriceType: "OnlyBase", // neplátce DPH: cena bez rozpisu DPH (ověřit)
        VatRateType: "Zero",
      })),
    },
  };
}

// Finance 1.0 — jediné místo, kde jsou adresy iDokladu. Ověřeno proti
// oficiálnímu SDK Solitea/IdokladSdk (DokladConfiguration.cs, Constants.cs,
// 7. 9. 2026). Používá se VÝHRADNĚ API v3.

export const IDOKLAD_API_BASE = "https://api.idoklad.cz/v3";
export const IDOKLAD_API_HOST = "api.idoklad.cz";
export const IDOKLAD_API_PATH_PREFIX = "/v3";

// Identity server — POST sem je jediný povolený zápis (získání access
// tokenu přes Client Credentials). "server/v2" je verze identity serveru,
// ne API v2 (to končí 5. 10. 2026 a nepoužívá se).
export const IDOKLAD_TOKEN_URL = "https://identity.idoklad.cz/server/v2/connect/token";
export const IDOKLAD_TOKEN_SCOPE = "idoklad_api";

// Kolekce, které smí Finance 1.0 ČÍST. Cokoli mimo seznam klient odmítne
// ještě před odesláním požadavku. BankAccounts/BankStatements/CashRegisters/
// CashVouchers jsou tu jen pro jednorázovou read-only kontrolu, které
// agendy Begina v iDokladu skutečně používá — do výpočtů V1 nevstupují.
export const IDOKLAD_READABLE_COLLECTIONS = [
  "IssuedInvoices",
  "CreditNotes",
  "ProformaInvoices",
  "SalesReceipts",
  "ReceivedInvoices",
  "ReceivedReceipts",
  "IssuedDocumentPayments",
  "ReceivedDocumentPayments",
  "Contacts",
  "Tags",
  "BankAccounts",
  "BankStatements",
  "CashRegisters",
  "CashVouchers",
] as const;

export type IdokladCollection = (typeof IDOKLAD_READABLE_COLLECTIONS)[number];

// Jednotlivé (ne-kolekční) čtecí cesty.
export const IDOKLAD_READABLE_SINGLE_PATHS = ["/Account/CurrentAgenda"] as const;

export const IDOKLAD_DEFAULT_PAGE_SIZE = 100; // SDK: výchozí 20, v příkladu 100; maximum neověřeno
export const IDOKLAD_DATE_FILTER_FORMAT = "yyyy-MM-dd HH:mm:ss.fff";

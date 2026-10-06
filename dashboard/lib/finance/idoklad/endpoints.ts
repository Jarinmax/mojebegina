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

// Authorization Code flow (developer aplikace „MojeBegina“). Oficiální SDK
// adresu přihlášení nesestavuje; dvojici authorize + token používají shodně
// konektor Orchesty (@orchesty/connector-idoklad, 29. 9. 2026) a knihovny
// mervit/iDoklad-v3 a DobryProgramator. Autorizační kód se vyměňuje na
// tokenové adrese STEJNÉHO identity serveru, odkud přišel.
export const IDOKLAD_AUTHORIZE_URL = "https://identity.idoklad.cz/server/connect/authorize";
export const IDOKLAD_AUTH_CODE_TOKEN_URL = "https://identity.idoklad.cz/server/connect/token";

// Jediné adresy, kam smí odejít POST (získání tokenu).
export const IDOKLAD_ALLOWED_TOKEN_URLS: readonly string[] = [IDOKLAD_TOKEN_URL, IDOKLAD_AUTH_CODE_TOKEN_URL];

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
  // Číselné řady — jen pro read-only výpis v testu připojení (výběr
  // e-shopové řady faktur, IDOKLAD_ESHOP_SEQUENCE_ID). Jen GET.
  "NumericSequences",
  // Číselníky pro ostré vystavování e-shopových faktur (způsob úhrady,
  // měna, země) — jen read-only ověření v testu připojení. Jen GET.
  "PaymentOptions",
  "Currencies",
  "Countries",
] as const;

export type IdokladCollection = (typeof IDOKLAD_READABLE_COLLECTIONS)[number];

// Jednotlivé (ne-kolekční) čtecí cesty.
export const IDOKLAD_READABLE_SINGLE_PATHS = [
  "/Account/CurrentAgenda",
  // výchozí (nevystavená) faktura agendy — jen šablona hodnot, nic se nezakládá
  "/IssuedInvoices/Default",
  // náhled dalšího čísla v řadě — nic se nerezervuje
  "/NumericSequences/DocumentNumbers/IssuedInvoice",
] as const;

export const IDOKLAD_DEFAULT_PAGE_SIZE = 100; // SDK: výchozí 20, v příkladu 100; maximum neověřeno
export const IDOKLAD_DATE_FILTER_FORMAT = "yyyy-MM-dd HH:mm:ss.fff";

// Finance 1.0 — chyby iDokladu s lidsky srozumitelnou zprávou pro cockpit.
// `message` i `userMessage` nikdy neobsahují přístupové údaje (viz
// redact.ts); technický detail (`detail`) je zkrácený a očištěný.

export type IdokladErrorCode =
  | "not_configured"
  | "request_blocked"
  | "auth_failed"
  | "forbidden"
  | "api_not_allowed"
  | "billing"
  | "rate_limited"
  | "budget_exhausted"
  | "not_found"
  | "server_error"
  | "network"
  | "invalid_response"
  | "agenda_mismatch"
  | "vat_mismatch";

const USER_MESSAGES: Record<IdokladErrorCode, string> = {
  not_configured: "Připojení k iDokladu není v tomto prostředí nastavené.",
  request_blocked: "Požadavek byl zablokován pojistkou „jen čtení“ — nic se do iDokladu neodeslalo.",
  auth_failed:
    "iDoklad odmítl přihlášení. Zkontrolujte Client ID a Client Secret v proměnných prostředí Vercelu.",
  forbidden: "Uživatel iDokladu, ke kterému patří přístupové údaje, nemá oprávnění tato data číst.",
  api_not_allowed: "API iDokladu není pro tuto agendu povolené (tarif nebo nastavení agendy).",
  billing: "iDoklad hlásí problém s předplatným agendy — API je dočasně nedostupné.",
  rate_limited: "Byl vyčerpán limit požadavků na API iDokladu. Synchronizace bude pokračovat později.",
  budget_exhausted:
    "Synchronizace se zastavila na bezpečnostním limitu požadavků pro jeden běh. Další běh naváže tam, kde skončila.",
  not_found: "Požadovaný záznam v iDokladu neexistuje.",
  server_error: "iDoklad je dočasně nedostupný. Zkuste synchronizaci později.",
  network: "Nepodařilo se spojit s iDokladem (síťová chyba).",
  invalid_response: "iDoklad vrátil odpověď v neočekávaném tvaru. Synchronizace se zastavila, data se nezměnila.",
  agenda_mismatch:
    "Přístupové údaje patří jiné agendě iDokladu, než je pro toto prostředí povolená. Synchronizace se nespustila.",
  vat_mismatch:
    "Nastavení DPH ve MojeBegina neodpovídá nastavení firmy v iDokladu. Před importem je nutné ho sjednotit.",
};

export class IdokladError extends Error {
  readonly code: IdokladErrorCode;
  readonly userMessage: string;
  readonly httpStatus: number | null;
  readonly detail: string | null;

  constructor(
    code: IdokladErrorCode,
    options: { httpStatus?: number | null; detail?: string | null; userMessage?: string } = {}
  ) {
    const userMessage = options.userMessage ?? USER_MESSAGES[code];
    super(options.detail ? `${userMessage} (${options.detail})` : userMessage);
    this.name = "IdokladError";
    this.code = code;
    this.userMessage = userMessage;
    this.httpStatus = options.httpStatus ?? null;
    this.detail = options.detail ?? null;
  }
}

// DokladErrorCode z SDK (Enums/DokladErrorCode.cs) — jen ty, které mění
// význam chyby pro uživatele.
const DOKLAD_ERROR_API_FORBIDDEN = 126;
const DOKLAD_ERROR_BILLING = 600;
const DOKLAD_ERROR_USER_RIGHTS = 420;

export function classifyHttpError(httpStatus: number, dokladErrorCode: number | null): IdokladErrorCode {
  if (dokladErrorCode === DOKLAD_ERROR_API_FORBIDDEN) return "api_not_allowed";
  if (dokladErrorCode === DOKLAD_ERROR_BILLING) return "billing";
  if (dokladErrorCode === DOKLAD_ERROR_USER_RIGHTS) return "forbidden";
  if (httpStatus === 401) return "auth_failed";
  if (httpStatus === 403) return "forbidden";
  if (httpStatus === 404) return "not_found";
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus === 402) return "billing";
  if (httpStatus >= 500) return "server_error";
  return "invalid_response";
}

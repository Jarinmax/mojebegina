// ESHOP 1.0 — HTTP klient iDoklad API v3 pro OSTRÉ vystavení e-shopové
// faktury. Jediné místo v e-shopu, které smí na iDoklad poslat zápis.
//
// Pojistka (assertEshopIdokladRequest) projde KAŽDÝ požadavek ještě před
// odesláním:
//   • host jen identity.idoklad.cz (POST pro token) a api.idoklad.cz/v3,
//   • čtení (GET) jen na cesty ze seznamu READ_PATHS,
//   • zápis jen tři operace z WRITE_OPERATIONS — založení kontaktu,
//     vystavení faktury, úplná úhrada faktury — a JEN když klient vznikl
//     s otevřenou bránou ostrého provozu (mode.ts: liveInvoicingGate —
//     Vercel Production + IDOKLAD_INVOICING_ENABLED=on + řada 7277293 +
//     přístupové údaje). Na Preview brána nikdy otevřená není, takže zápis
//     se tam zablokuje ještě před sítí,
//   • nic jiného: žádné DELETE/PATCH, žádné /Mails (e-mail z iDokladu se
//     zákazníkovi NEPOSÍLÁ — PDF posílá MojeBegina), žádné úpravy řad,
//     žádné jiné doklady.
//
// Adresy, pole a formáty podle oficiálního SDK Solitea/IdokladSdk 5.4.0
// (IssuedInvoiceClient, IssuedDocumentPaymentClient.FullyPayAsync,
// NumericSequenceClient.GetDocumentNumberAsync, ReportBaseDetail, Readonly
// klienti; ověřeno 7. 10. 2026). Tokenová adresa a scope stejně jako ve
// Finance 1.0 (Client Credentials, identity server v2).
//
// Client ID, Client Secret ani token se nikdy nelogují ani neukládají.
// Přesměrování se nesledují (redirect: "error").
import { liveInvoicingGate } from "./mode";

export const IDOKLAD_API_BASE = "https://api.idoklad.cz/v3";
export const IDOKLAD_TOKEN_URL = "https://identity.idoklad.cz/server/v2/connect/token";
export const IDOKLAD_TOKEN_SCOPE = "idoklad_api";

const API_HOST = "api.idoklad.cz";
const TOKEN_HOST = "identity.idoklad.cz";

/** Čtecí cesty (bez /v3). `{id}` = kladné celé číslo. */
const READ_PATHS: readonly RegExp[] = [
  /^\/Account\/CurrentAgenda$/,
  /^\/NumericSequences$/,
  /^\/NumericSequences\/DocumentNumbers\/IssuedInvoice$/,
  /^\/Contacts$/,
  /^\/Contacts\/[1-9][0-9]{0,9}$/,
  /^\/IssuedInvoices$/,
  /^\/IssuedInvoices\/Default$/,
  /^\/IssuedInvoices\/[1-9][0-9]{0,9}$/,
  /^\/Currencies$/,
  /^\/Countries$/,
  /^\/PaymentOptions$/,
  /^\/Reports\/IssuedInvoice\/[1-9][0-9]{0,9}\/Pdf$/,
];

/** Jediné povolené zápisy. Nic dalšího klient neodešle. */
export const WRITE_OPERATIONS = [
  { method: "POST", path: /^\/Contacts$/, label: "založení kontaktu" },
  { method: "POST", path: /^\/IssuedInvoices$/, label: "vystavení faktury" },
  { method: "PUT", path: /^\/IssuedDocumentPayments\/FullyPay\/[1-9][0-9]{0,9}$/, label: "úplná úhrada faktury" },
] as const;

export class IdokladBlockedError extends Error {
  constructor(reason: string) {
    super(`Požadavek na iDoklad zablokován: ${reason}`);
    this.name = "IdokladBlockedError";
  }
}

export class IdokladApiError extends Error {
  readonly httpStatus: number | null;
  constructor(message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "IdokladApiError";
    this.httpStatus = httpStatus;
  }
}

/** Kontrola požadavku před odesláním. `writesAllowed` dává jen otevřená brána ostrého provozu. */
export function assertEshopIdokladRequest(method: string, rawUrl: string, writesAllowed: boolean): void {
  const m = method.toUpperCase();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new IdokladBlockedError("neplatná adresa");
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password || url.hash) {
    throw new IdokladBlockedError("povolené je jen https bez portu a přihlašovacích údajů");
  }
  // „..“ i zakódované lomítko/tečky — URL parser by je sám rozřešil.
  if (/(\.\.|%2e|%2f|%5c|\\)/i.test(rawUrl)) throw new IdokladBlockedError("neplatná cesta");

  if (url.hostname === TOKEN_HOST) {
    if (m !== "POST" || url.href !== IDOKLAD_TOKEN_URL) {
      throw new IdokladBlockedError("na identity server jen POST pro token");
    }
    return;
  }
  if (url.hostname !== API_HOST || !url.pathname.startsWith("/v3/")) {
    throw new IdokladBlockedError(`nepovolený cíl ${url.hostname}${url.pathname}`);
  }
  const path = url.pathname.slice(3);
  if (m === "GET") {
    if (!READ_PATHS.some((re) => re.test(path))) throw new IdokladBlockedError(`čtení ${path} není povolené`);
    return;
  }
  const write = WRITE_OPERATIONS.find((op) => op.method === m && op.path.test(path));
  if (!write) throw new IdokladBlockedError(`${m} ${path} není povolený zápis`);
  if (!writesAllowed) {
    throw new IdokladBlockedError(`${write.label}: zápis do iDokladu je mimo ostrý provoz vypnutý`);
  }
  if (url.search !== "" && !(m === "PUT" && /^\?dateOfPayment=[0-9:+ .-]+$/.test(decodeURIComponent(url.search)))) {
    throw new IdokladBlockedError("zápis nesmí mít parametry v adrese");
  }
}

export type IdokladLogEntry = { method: string; path: string; status: number | null; ms: number };

export type EshopIdokladClientOptions = {
  clientId: string;
  clientSecret: string;
  /** true jen z otevřené brány ostrého provozu (mode.ts) */
  writesAllowed: boolean;
  /** prostředí pro druhou kontrolu brány před každým zápisem (výchozí process.env) */
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** max. počet požadavků na jedno vystavení (ochrana denní kvóty) */
  requestBudget?: number;
  timeoutMs?: number;
};

type Envelope = { Data?: unknown; IsSuccess?: boolean; Message?: string; StatusCode?: number; ErrorCode?: number };

export type IdokladListPage<T> = { Items: T[]; TotalItems: number; TotalPages: number };

export class EshopIdokladClient {
  private readonly opts: Required<Omit<EshopIdokladClientOptions, "clientId" | "clientSecret">> & {
    clientId: string;
    clientSecret: string;
  };
  private token: { value: string; expiresAt: number } | null = null;
  private count = 0;
  readonly log: IdokladLogEntry[] = [];

  constructor(options: EshopIdokladClientOptions) {
    if (!options.clientId || !options.clientSecret) throw new IdokladApiError("Chybí přístupové údaje k iDokladu.");
    // Výchozí hodnoty přes ?? (ne „...options“): volající předává i výslovné
    // undefined (např. fetchImpl: deps.fetchImpl) a to nesmí výchozí přepsat.
    this.opts = {
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      writesAllowed: options.writesAllowed,
      fetchImpl: options.fetchImpl ?? fetch,
      now: options.now ?? Date.now,
      requestBudget: options.requestBudget ?? 40,
      timeoutMs: options.timeoutMs ?? 10_000,
      env: options.env ?? process.env,
    };
  }

  /**
   * Zápis jen když to klient dostal výslovně A ZÁROVEŇ je brána ostrého
   * provozu otevřená právě teď (Vercel Production + zapnutí + řada 7277293).
   * Na Preview je proto zápis zablokovaný, i kdyby někdo vytvořil klienta
   * s writesAllowed: true.
   */
  get writesAllowed(): boolean {
    return this.opts.writesAllowed && liveInvoicingGate(this.opts.env).open;
  }

  get requestCount(): number {
    return this.count;
  }

  /** true = přihlášení (Client Credentials) prošlo a klient má token */
  get authenticated(): boolean {
    return this.token !== null;
  }

  private redact(text: string): string {
    let out = text;
    for (const secret of [this.opts.clientId, this.opts.clientSecret, this.token?.value]) {
      if (secret) out = out.split(secret).join("***");
    }
    return out.replace(/\s+/g, " ").slice(0, 300);
  }

  private async send(method: string, url: string, init: RequestInit): Promise<Response> {
    // pojistka dřív než cokoli jiného — i před rozpočtem a tokenem
    assertEshopIdokladRequest(method, url, this.writesAllowed);
    if (this.count >= this.opts.requestBudget) throw new IdokladApiError("Vyčerpán limit požadavků na iDoklad.");
    this.count += 1;
    const started = this.opts.now();
    const path = new URL(url).pathname;
    try {
      const response = await this.opts.fetchImpl(url, {
        ...init,
        method,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
      this.log.push({ method, path, status: response.status, ms: this.opts.now() - started });
      return response;
    } catch (error) {
      this.log.push({ method, path, status: null, ms: this.opts.now() - started });
      throw new IdokladApiError(`iDoklad nedostupný: ${this.redact(error instanceof Error ? error.message : String(error))}`);
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > this.opts.now()) return this.token.value;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
      scope: IDOKLAD_TOKEN_SCOPE,
    });
    const response = await this.send("POST", IDOKLAD_TOKEN_URL, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    const text = await response.text();
    if (!response.ok) throw new IdokladApiError(`Přihlášení k iDokladu selhalo (${response.status}).`, response.status);
    let parsed: { access_token?: unknown; expires_in?: unknown } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // níže
    }
    if (typeof parsed.access_token !== "string" || !parsed.access_token) {
      throw new IdokladApiError("iDoklad nevrátil přístupový token.", response.status);
    }
    const seconds = typeof parsed.expires_in === "number" && parsed.expires_in > 0 ? parsed.expires_in : 3600;
    this.token = { value: parsed.access_token, expiresAt: this.opts.now() + seconds * 1000 };
    return this.token.value;
  }

  private async call<T>(method: "GET" | "POST" | "PUT", path: string, query?: Record<string, string>, body?: unknown): Promise<T> {
    const url = new URL(`${IDOKLAD_API_BASE}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    // Pojistka se ověří i tady (před získáním tokenu), aby blokovaný zápis
    // na Preview neposlal na identity server ani žádost o token.
    assertEshopIdokladRequest(method, url.toString(), this.writesAllowed);
    const token = await this.accessToken();
    const response = await this.send(method, url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let envelope: Envelope | null = null;
    try {
      envelope = text ? (JSON.parse(text) as Envelope) : null;
    } catch {
      envelope = null;
    }
    if (!response.ok || envelope?.IsSuccess === false) {
      if (response.status === 401) this.token = null;
      const status = response.ok ? (envelope?.StatusCode ?? 400) : response.status;
      throw new IdokladApiError(`iDoklad ${method} ${path}: ${status} ${this.redact(envelope?.Message ?? text)}`, status);
    }
    if (!envelope || !("Data" in envelope)) throw new IdokladApiError(`iDoklad ${method} ${path}: odpověď bez Data`, response.status);
    return envelope.Data as T;
  }

  get<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.call<T>("GET", path, query);
  }

  async list<T>(path: string, filter?: string, pageSize = 100): Promise<IdokladListPage<T>> {
    const query: Record<string, string> = { page: "1", pageSize: String(pageSize) };
    if (filter) query.filter = filter;
    const data = await this.call<Partial<IdokladListPage<T>>>("GET", path, query);
    if (!data || !Array.isArray(data.Items)) throw new IdokladApiError(`iDoklad GET ${path}: chybí Items`);
    return {
      Items: data.Items,
      TotalItems: typeof data.TotalItems === "number" ? data.TotalItems : data.Items.length,
      TotalPages: typeof data.TotalPages === "number" ? data.TotalPages : 1,
    };
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.call<T>("POST", path, undefined, body);
  }

  put<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.call<T>("PUT", path, query);
  }
}

/** Filtr ve tvaru SDK: Prop~eq~hodnota (hodnota bez znaků, které by filtr rozbily). */
export function eqFilter(property: string, value: string): string {
  if (!/^[A-Za-z]+$/.test(property)) throw new Error(`Neplatné pole filtru: ${property}`);
  if (!/^[\p{L}\p{N}@._+ -]{1,100}$/u.test(value) || value.includes("~")) {
    throw new IdokladBlockedError("neplatná hodnota filtru");
  }
  return `${property}~eq~${value}`;
}

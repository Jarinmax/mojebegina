// Finance 1.0 — čtecí klient iDoklad API v3.
//
// Bezpečnostní pravidla (schválená 4. 10. 2026):
//   • POST jen na přesnou adresu identity serveru pro token,
//   • na datové API jen GET a jen na povolené cesty (requestGuard.ts),
//   • Client ID, Client Secret ani access token se nikdy nelogují ani
//     neukládají do DB — token žije jen v paměti této instance klienta,
//   • přesměrování se nesledují (redirect: "error"), aby požadavek nemohl
//     skončit jinde, než prošel kontrolou,
//   • počet požadavků na jeden běh je omezený (requestBudget) — ochrana
//     denní kvóty API (neoficiálně ~7 500 požadavků/den, neověřeno).
//
// Klient nezná DB ani Next.js — `fetchImpl` a `now` se dají v testech
// podstrčit, takže celé chování je testovatelné bez sítě.
import {
  IDOKLAD_API_BASE,
  IDOKLAD_DEFAULT_PAGE_SIZE,
  IDOKLAD_TOKEN_SCOPE,
  IDOKLAD_TOKEN_URL,
  type IdokladCollection,
} from "./endpoints";
import { IdokladError, classifyHttpError } from "./errors";
import { safeSnippet } from "./redact";
import { IdokladRequestBlockedError, assertIdokladRequestAllowed } from "./requestGuard";

export type IdokladCredentials = {
  clientId: string;
  clientSecret: string;
};

export type IdokladLogEvent = {
  kind: "token" | "request" | "error";
  method: "GET" | "POST";
  path: string; // bez query (filtry mohou obsahovat čísla dokladů, ne tajemství — ale stačí cesta)
  status?: number;
  durationMs?: number;
  code?: string;
};

export type IdokladClientOptions = {
  credentials: IdokladCredentials;
  fetchImpl?: typeof fetch;
  now?: () => number;
  requestBudget?: number;
  log?: (event: IdokladLogEvent) => void;
};

export type IdokladPage<T> = {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
};

export type ListOptions = {
  filter?: string;
  sort?: string;
  pageSize?: number;
  startPage?: number;
};

type Envelope = {
  Data?: unknown;
  IsSuccess?: boolean;
  ErrorCode?: number;
  Message?: string;
  StatusCode?: number;
};

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const DEFAULT_REQUEST_BUDGET = 500;

export class IdokladClient {
  private readonly credentials: IdokladCredentials;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly requestBudget: number;
  private readonly log: (event: IdokladLogEvent) => void;
  private token: { value: string; expiresAt: number } | null = null;
  private requests = 0;

  constructor(options: IdokladClientOptions) {
    if (!options.credentials.clientId || !options.credentials.clientSecret) {
      throw new IdokladError("not_configured");
    }
    this.credentials = options.credentials;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.requestBudget = options.requestBudget ?? DEFAULT_REQUEST_BUDGET;
    this.log = options.log ?? (() => {});
  }

  get requestCount(): number {
    return this.requests;
  }

  get remainingBudget(): number {
    return Math.max(0, this.requestBudget - this.requests);
  }

  private secrets(): string[] {
    return [this.credentials.clientId, this.credentials.clientSecret, this.token?.value ?? ""];
  }

  private async send(method: "GET" | "POST", url: string, init: RequestInit): Promise<Response> {
    try {
      assertIdokladRequestAllowed(method, url);
    } catch (error) {
      if (error instanceof IdokladRequestBlockedError) {
        throw new IdokladError("request_blocked", { detail: error.message });
      }
      throw error;
    }
    const path = new URL(url).pathname;
    const startedAt = this.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, method, redirect: "error", cache: "no-store" });
    } catch (error) {
      this.log({ kind: "error", method, path, code: "network" });
      const message = error instanceof Error ? error.message : String(error);
      throw new IdokladError("network", { detail: safeSnippet(message, this.secrets()) });
    }
    this.log({
      kind: url === IDOKLAD_TOKEN_URL ? "token" : "request",
      method,
      path,
      status: response.status,
      durationMs: this.now() - startedAt,
    });
    return response;
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) {
      return this.token.value;
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      scope: IDOKLAD_TOKEN_SCOPE,
    });
    const response = await this.send("POST", IDOKLAD_TOKEN_URL, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    const text = await response.text();
    if (!response.ok) {
      const code = response.status === 400 || response.status === 401 ? "auth_failed" : classifyHttpError(response.status, null);
      throw new IdokladError(code, {
        httpStatus: response.status,
        detail: safeSnippet(text, this.secrets()),
      });
    }
    let parsed: { access_token?: unknown; expires_in?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new IdokladError("invalid_response", { httpStatus: response.status, detail: "token: neplatný JSON" });
    }
    if (typeof parsed.access_token !== "string" || parsed.access_token.length === 0) {
      throw new IdokladError("invalid_response", { httpStatus: response.status, detail: "token: chybí access_token" });
    }
    const expiresInSeconds = typeof parsed.expires_in === "number" && parsed.expires_in > 0 ? parsed.expires_in : 3600;
    this.token = { value: parsed.access_token, expiresAt: this.now() + expiresInSeconds * 1000 };
    return this.token.value;
  }

  // GET na datové API. Vrací obsah `Data` z obálky iDokladu.
  async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    if (this.requests >= this.requestBudget) {
      throw new IdokladError("budget_exhausted");
    }
    const url = new URL(`${IDOKLAD_API_BASE}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const token = await this.getAccessToken();
    this.requests += 1;
    const response = await this.send("GET", url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const text = await response.text();
    let envelope: Envelope | null = null;
    try {
      envelope = text ? (JSON.parse(text) as Envelope) : null;
    } catch {
      envelope = null;
    }
    if (!response.ok || (envelope && envelope.IsSuccess === false)) {
      if (response.status === 401) {
        // Token mohl vypršet dřív, než tvrdil expires_in — příště nový.
        this.token = null;
      }
      const dokladCode = typeof envelope?.ErrorCode === "number" ? envelope.ErrorCode : null;
      const status = response.ok ? (envelope?.StatusCode ?? 400) : response.status;
      throw new IdokladError(classifyHttpError(status, dokladCode), {
        httpStatus: status,
        detail: safeSnippet(envelope?.Message ?? text, this.secrets()),
      });
    }
    if (!envelope || !("Data" in envelope)) {
      throw new IdokladError("invalid_response", { httpStatus: response.status, detail: `${path}: chybí Data` });
    }
    return envelope.Data as T;
  }

  async getPage<T>(collection: IdokladCollection, page: number, options: ListOptions = {}): Promise<IdokladPage<T>> {
    const query: Record<string, string> = {
      page: String(page),
      pageSize: String(options.pageSize ?? IDOKLAD_DEFAULT_PAGE_SIZE),
    };
    if (options.filter) query.filter = options.filter;
    if (options.sort) query.sort = options.sort;
    const data = await this.get<{ Items?: unknown; TotalItems?: unknown; TotalPages?: unknown }>(
      `/${collection}`,
      query
    );
    if (!data || !Array.isArray(data.Items)) {
      throw new IdokladError("invalid_response", { detail: `${collection}: chybí Items` });
    }
    return {
      items: data.Items as T[],
      page,
      totalPages: typeof data.TotalPages === "number" ? data.TotalPages : 1,
      totalItems: typeof data.TotalItems === "number" ? data.TotalItems : data.Items.length,
    };
  }

  // Projde všechny stránky. Volající dostává stránku po stránce, takže
  // může průběžně ukládat a při vyčerpání limitu navázat od další stránky.
  async *listPages<T>(collection: IdokladCollection, options: ListOptions = {}): AsyncGenerator<IdokladPage<T>> {
    let page = options.startPage ?? 1;
    for (;;) {
      const result = await this.getPage<T>(collection, page, options);
      yield result;
      if (result.items.length === 0 || page >= result.totalPages) {
        return;
      }
      page += 1;
    }
  }
}

// Filtr ve tvaru SDK: (Prop~gte~2026-10-01 00:00:00.000), spojení ~and~.
export function formatFilterDate(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
  );
}

export function filterExpression(property: string, operator: "lt" | "lte" | "gt" | "gte" | "eq", value: string): string {
  if (!/^[A-Za-z.]+$/.test(property)) {
    throw new Error(`Neplatný název pole filtru: ${property}`);
  }
  return `(${property}~${operator}~${value})`;
}

export function andFilters(...expressions: string[]): string {
  return expressions.filter(Boolean).join("~and~");
}

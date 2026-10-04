// Finance 1.0 — OAuth (Authorization Code flow) pro developer aplikaci
// iDokladu „MojeBegina“. První test (4. 10. 2026) jen přihlásí a read-only
// ověří agendu; nic se neukládá:
//   • scope je jen `idoklad_api` — BEZ `offline_access`, takže iDoklad
//     nevydá refresh token a po testu neexistuje nic dlouhodobě platného,
//   • access token žije jen v paměti jednoho požadavku (callback) a zahodí se,
//   • `state` je podepsaný (HMAC-SHA256, IDOKLAD_OAUTH_STATE_SECRET), vázaný
//     na userId přihlášeného uživatele MojeBegina, platí 10 minut a ověřuje se
//     proti kopii v httpOnly cookie (ochrana proti CSRF / podstrčenému kódu),
//   • výměna kódu jde přes stejnou pojistku jako zbytek klienta (POST jen na
//     povolenou adresu pro token), bez sledování přesměrování.
// Kód, Client Secret ani token se nikdy nelogují ani nevracejí v chybě.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { IDOKLAD_AUTHORIZE_URL, IDOKLAD_AUTH_CODE_TOKEN_URL } from "./endpoints";
import { IdokladError, classifyHttpError } from "./errors";
import { safeSnippet } from "./redact";
import { IdokladRequestBlockedError, assertIdokladRequestAllowed } from "./requestGuard";

export const IDOKLAD_OAUTH_TEST_SCOPE = "idoklad_api";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// ------------------------------------------------------------ podepsané hodnoty

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signPayload(payload: unknown, secret: string): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${base64url(hmac(body, secret))}`;
}

export function verifySignedPayload<T>(token: string | null | undefined, secret: string): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = hmac(body, secret);
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ state

type StatePayload = { v: 1; n: string; u: string; e: number };

export function createOAuthState(options: { userId: string; secret: string; now: number }): string {
  const payload: StatePayload = {
    v: 1,
    n: randomBytes(16).toString("base64url"),
    u: options.userId,
    e: options.now + OAUTH_STATE_TTL_MS,
  };
  return signPayload(payload, options.secret);
}

export type StateCheck = { ok: true } | { ok: false; reason: string };

export function verifyOAuthState(options: {
  cookieState: string | null | undefined;
  returnedState: string | null | undefined;
  userId: string;
  secret: string;
  now: number;
}): StateCheck {
  const { cookieState, returnedState } = options;
  if (!cookieState) return { ok: false, reason: "Platnost přihlášení vypršela nebo bylo zahájeno v jiném prohlížeči/adrese. Zkuste to znovu." };
  if (!returnedState) return { ok: false, reason: "iDoklad nevrátil kontrolní hodnotu (state)." };
  const a = Buffer.from(cookieState);
  const b = Buffer.from(returnedState);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "Kontrolní hodnota (state) nesouhlasí — přihlášení bylo odmítnuto." };
  }
  const payload = verifySignedPayload<StatePayload>(returnedState, options.secret);
  if (!payload || payload.v !== 1) return { ok: false, reason: "Kontrolní hodnota (state) je neplatná." };
  if (payload.e < options.now) return { ok: false, reason: "Platnost přihlášení vypršela (10 minut). Zkuste to znovu." };
  if (payload.u !== options.userId) {
    return { ok: false, reason: "Přihlášení zahájil jiný uživatel MojeBegina." };
  }
  return { ok: true };
}

// ------------------------------------------------------------ přihlášení

export function buildAuthorizeUrl(options: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(IDOKLAD_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", IDOKLAD_OAUTH_TEST_SCOPE);
  url.searchParams.set("state", options.state);
  return url.toString();
}

export type ExchangedToken = {
  accessToken: string;
  expiresInSeconds: number;
  scope: string | null;
  // iDoklad by ho při scope bez offline_access vracet neměl; kdyby ano,
  // HODNOTA se zahodí — zůstane jen informace pro výsledek testu.
  refreshTokenReturned: boolean;
};

export async function exchangeAuthorizationCode(options: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<ExchangedToken> {
  const secrets = [options.clientId, options.clientSecret, options.code];
  try {
    assertIdokladRequestAllowed("POST", IDOKLAD_AUTH_CODE_TOKEN_URL);
  } catch (error) {
    if (error instanceof IdokladRequestBlockedError) throw new IdokladError("request_blocked", { detail: error.message });
    throw error;
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: options.clientId,
    client_secret: options.clientSecret,
  });
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(IDOKLAD_AUTH_CODE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
      redirect: "error",
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new IdokladError("network", { detail: safeSnippet(message, secrets) });
  }
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    const oauthError = typeof parsed.error === "string" ? parsed.error : null;
    if (response.status === 400 || response.status === 401) {
      throw new IdokladError("auth_failed", {
        httpStatus: response.status,
        userMessage:
          oauthError === "invalid_client"
            ? "iDoklad odmítl Client ID / Client Secret aplikace MojeBegina. Zkontrolujte proměnné ve Vercelu."
            : oauthError === "invalid_grant"
              ? "iDoklad odmítl autorizační kód (vypršel, byl už použit, nebo nesouhlasí Redirect URI). Zkuste připojení znovu."
              : "iDoklad odmítl výměnu autorizačního kódu za token.",
        detail: oauthError ? safeSnippet(oauthError, secrets, 60) : null,
      });
    }
    throw new IdokladError(classifyHttpError(response.status, null), {
      httpStatus: response.status,
      detail: safeSnippet(text, secrets),
    });
  }
  if (typeof parsed.access_token !== "string" || parsed.access_token.length === 0) {
    throw new IdokladError("invalid_response", { httpStatus: response.status, detail: "token: chybí access_token" });
  }
  return {
    accessToken: parsed.access_token,
    expiresInSeconds: typeof parsed.expires_in === "number" ? parsed.expires_in : 3600,
    scope: typeof parsed.scope === "string" ? parsed.scope : null,
    refreshTokenReturned: typeof parsed.refresh_token === "string" && parsed.refresh_token.length > 0,
  };
}

// GPT/MCP pilot — čisté funkce OAuth 2.1 (bez DB a bez Next.js), aby šly
// otestovat tabulkou případů (lib/agent/__tests__/oauthCore.test.ts).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SCOPE_READ, SCOPE_WRITE, SUPPORTED_SCOPES, type AgentConfig } from "./config";
import type { SystemRole } from "@/lib/data/types";

// --- Tokeny -------------------------------------------------------------

export type TokenKind = "code" | "access" | "refresh";

const PREFIX: Record<TokenKind, string> = { code: "mbc_", access: "mba_", refresh: "mbr_" };

/** Náhodný token (256 bitů). Prefix jen pro čitelnost v logu/při úniku (např. GitHub secret scanning). */
export function newToken(kind: TokenKind): string {
  return PREFIX[kind] + randomBytes(32).toString("base64url");
}

/** Do DB jde jen tenhle otisk, nikdy token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Porovnání tajemství v konstantním čase (přes otisky, takže i různé délky). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// --- PKCE (RFC 7636, jen S256) -----------------------------------------

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isValidCodeChallenge(challenge: string): boolean {
  return PKCE_CHALLENGE.test(challenge);
}

export function pkceChallengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  return PKCE_VERIFIER.test(verifier) && safeEqual(pkceChallengeFor(verifier), challenge);
}

// --- Rozsah (scope) ------------------------------------------------------

/**
 * Z požadovaného scope ponechá jen podporované hodnoty. Čtení je vždy
 * součástí (bez něj by asistent neuměl nic); prázdný požadavek = nabídnout
 * obojí, rozhodne uživatel na souhlasové stránce.
 */
export function requestedScopes(raw: string | null | undefined): { read: true; write: boolean } {
  const parts = (raw ?? "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { read: true, write: true };
  return { read: true, write: parts.includes(SCOPE_WRITE) };
}

export function scopeString(write: boolean): string {
  return write ? `${SCOPE_READ} ${SCOPE_WRITE}` : SCOPE_READ;
}

export function hasScope(scope: string, wanted: (typeof SUPPORTED_SCOPES)[number]): boolean {
  return scope.split(/\s+/).includes(wanted);
}

/** Zápis jen se souhlasem k zápisu A zároveň zapnutým MCP_ALLOW_WRITE na serveru. */
export function canWrite(config: AgentConfig, scope: string): boolean {
  return config.writeEnabled && hasScope(scope, SCOPE_WRITE);
}

// --- Klient (statický, z env) -------------------------------------------

/** client_secret_basic (hlavička) nebo client_secret_post (tělo formuláře). */
export function readClientCredentials(
  authorization: string | null,
  form: URLSearchParams
): { clientId: string; clientSecret: string } | null {
  if (authorization?.toLowerCase().startsWith("basic ")) {
    let decoded: string;
    try {
      decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
    } catch {
      return null;
    }
    const colon = decoded.indexOf(":");
    if (colon === -1) return null;
    // RFC 6749 2.3.1 — id i secret jsou v Basic hlavičce form-urlencoded.
    try {
      return {
        clientId: decodeURIComponent(decoded.slice(0, colon).replace(/\+/g, " ")),
        clientSecret: decodeURIComponent(decoded.slice(colon + 1).replace(/\+/g, " ")),
      };
    } catch {
      return null;
    }
  }
  const clientId = form.get("client_id");
  const clientSecret = form.get("client_secret");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function authenticateClient(
  config: AgentConfig,
  credentials: { clientId: string; clientSecret: string } | null
): boolean {
  if (!credentials) return false;
  // Obě porovnání vždy (žádné zkratkové vyhodnocení podle id).
  const idOk = safeEqual(credentials.clientId, config.clientId);
  const secretOk = safeEqual(credentials.clientSecret, config.clientSecret);
  return idOk && secretOk;
}

// --- /oauth/authorize — kontrola parametrů --------------------------------

export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  write: boolean;
};

export type AuthorizeCheck =
  | { ok: true; value: AuthorizeParams }
  // Neznámý klient nebo redirect: NIKDY nepřesměrovat (open redirect) — jen chybová stránka.
  | { ok: false; redirectable: false; message: string }
  // Ostatní chyby jdou podle RFC 6749 zpět na (ověřený) redirect_uri.
  | { ok: false; redirectable: true; redirectUri: string; state: string | null; error: string; description: string };

type Params = Record<string, string | string[] | undefined>;

function single(params: Params, key: string): string | null {
  const value = params[key];
  if (Array.isArray(value)) return null; // duplicitní parametr = neplatný požadavek
  return value ?? null;
}

export function checkAuthorizeParams(config: AgentConfig, params: Params): AuthorizeCheck {
  const clientId = single(params, "client_id");
  const redirectUri = single(params, "redirect_uri");
  if (!clientId || !safeEqual(clientId, config.clientId)) {
    return { ok: false, redirectable: false, message: "Neznámá aplikace (client_id)." };
  }
  if (!redirectUri || !config.redirectUris.includes(redirectUri)) {
    return { ok: false, redirectable: false, message: "Nepovolená návratová adresa (redirect_uri)." };
  }

  const state = single(params, "state");
  const fail = (error: string, description: string): AuthorizeCheck => ({
    ok: false,
    redirectable: true,
    redirectUri,
    state,
    error,
    description,
  });

  if (single(params, "response_type") !== "code") {
    return fail("unsupported_response_type", "Podporován je jen response_type=code.");
  }
  const challenge = single(params, "code_challenge");
  if (single(params, "code_challenge_method") !== "S256" || !challenge || !isValidCodeChallenge(challenge)) {
    return fail("invalid_request", "Vyžaduje se PKCE s code_challenge_method=S256.");
  }
  const resource = single(params, "resource");
  if (resource !== null && resource.replace(/\/+$/, "") !== `${config.issuer}/api/mcp`) {
    return fail("invalid_target", "Neznámý zdroj (resource).");
  }

  return {
    ok: true,
    value: {
      clientId,
      redirectUri,
      state,
      codeChallenge: challenge,
      write: requestedScopes(single(params, "scope")).write,
    },
  };
}

/** Návrat do ChatGPT: code nebo error + state + iss (RFC 9207). */
export function authorizeRedirect(
  config: AgentConfig,
  redirectUri: string,
  state: string | null,
  fields: Record<string, string>
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
  if (state !== null) url.searchParams.set("state", state);
  url.searchParams.set("iss", config.issuer);
  return url.toString();
}

// --- Role a pilotní allowlist ------------------------------------------------

/**
 * Pilot: přístup asistenta smí udělit jen ADMIN nebo EXECUTIVE (stejný okruh
 * jako CRM a Živá mapa firmy). Vlastní funkce, ne import z crmAuth.ts —
 * až se přidá EMPLOYEE/SALES, mění se jen tady (stejný princip izolovaných
 * bran jako v lib/data/*Auth.ts). Co pak asistent SMÍ, rozhodují dál
 * stávající brány jednotlivých domén.
 */
export const AGENT_ROLES: SystemRole[] = ["ADMIN", "EXECUTIVE"];

export function agentEligibleRoles(grantedRoles: SystemRole[]): SystemRole[] {
  return AGENT_ROLES.filter((role) => grantedRoles.includes(role));
}

export function isAgentUserAllowed(config: AgentConfig, userId: string): boolean {
  return config.allowedUserIds.has(userId);
}

// --- Souhlasová stránka a návrat po přihlášení ------------------------------

export const AUTHORIZE_PATH = "/oauth/authorize";

/** Dotazový řetězec → parametry; opakovaný klíč zůstane polem (checkAuthorizeParams ho odmítne). */
export function paramsFromQuery(query: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const current = result[key];
    result[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  }
  return result;
}

/** Parametry stránky (searchParams) → dotazový řetězec bez "?". */
export function queryFromParams(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) search.append(key, v);
  }
  return search.toString();
}

/**
 * Kam se po přihlášení vrátit (?next= na /login). Povolená je JEN
 * souhlasová stránka asistenta — cokoli jiného (cizí doména, "//evil",
 * "/\\evil", jiná cesta) = "/" (žádný open redirect).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (raw !== AUTHORIZE_PATH && !raw.startsWith(`${AUTHORIZE_PATH}?`)) return "/";
  if (/[\\\s]/.test(raw)) return "/";
  return raw;
}

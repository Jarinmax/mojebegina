// Finance 1.0 — OAuth (Authorization Code) pro první read-only test:
// podepsaný state, adresa přihlášení bez offline_access, výměna kódu přes
// pojistku a bez úniku kódu / Client Secret / tokenu.
import { describe, expect, it } from "vitest";
import {
  OAUTH_STATE_TTL_MS,
  buildAuthorizeUrl,
  createOAuthState,
  exchangeAuthorizationCode,
  signPayload,
  verifyOAuthState,
  verifySignedPayload,
} from "../idoklad/oauth";
import { IDOKLAD_AUTH_CODE_TOKEN_URL, IDOKLAD_AUTHORIZE_URL, IDOKLAD_TOKEN_URL } from "../idoklad/endpoints";
import { IdokladRequestBlockedError, assertIdokladRequestAllowed } from "../idoklad/requestGuard";
import { IdokladError } from "../idoklad/errors";

const SECRET = "s".repeat(40);
const OTHER_SECRET = "t".repeat(40);
const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const NOW = 1_800_000_000_000;
const REDIRECT = "https://mojebegina-git-claude-great-bell-ffjwo3-jarin-max.vercel.app/api/idoklad/callback";
const CLIENT_ID = "client-id-MojeBegina";
const CLIENT_SECRET = "client-secret-very-secret-0123456789";
const CODE = "authcode-ABCDEF123456";

describe("adresa přihlášení", () => {
  it("authorize URL s response_type=code, redirect_uri, state a scope BEZ offline_access", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT, state: "st" }));
    expect(`${url.origin}${url.pathname}`).toBe(IDOKLAD_AUTHORIZE_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      scope: "idoklad_api",
      state: "st",
    });
    expect(url.toString()).not.toContain("offline_access");
    expect(url.toString()).not.toContain(CLIENT_SECRET);
  });
});

describe("state", () => {
  const state = createOAuthState({ userId: VINER, secret: SECRET, now: NOW });
  const check = (overrides: Partial<Parameters<typeof verifyOAuthState>[0]>) =>
    verifyOAuthState({ cookieState: state, returnedState: state, userId: VINER, secret: SECRET, now: NOW + 1000, ...overrides });

  it("platný state projde", () => {
    expect(check({})).toEqual({ ok: true });
  });

  it("každý state je jiný (náhodná složka)", () => {
    expect(createOAuthState({ userId: VINER, secret: SECRET, now: NOW })).not.toBe(state);
  });

  it("chybějící cookie (jiný prohlížeč / adresa) → odmítnuto", () => {
    expect(check({ cookieState: null }).ok).toBe(false);
  });

  it("state od iDokladu se liší od cookie (podstrčený kód) → odmítnuto", () => {
    const other = createOAuthState({ userId: VINER, secret: SECRET, now: NOW });
    expect(check({ returnedState: other }).ok).toBe(false);
  });

  it("upravený state (i se shodnou cookie) → odmítnuto podpisem", () => {
    const [body] = state.split(".");
    const forged = `${body}.${"A".repeat(43)}`;
    expect(check({ cookieState: forged, returnedState: forged }).ok).toBe(false);
  });

  it("state podepsaný jiným klíčem → odmítnuto", () => {
    const foreign = createOAuthState({ userId: VINER, secret: OTHER_SECRET, now: NOW });
    expect(check({ cookieState: foreign, returnedState: foreign }).ok).toBe(false);
  });

  it("jiný přihlášený uživatel → odmítnuto", () => {
    expect(check({ userId: "jiny-uzivatel" }).ok).toBe(false);
  });

  it("po 10 minutách vyprší", () => {
    expect(check({ now: NOW + OAUTH_STATE_TTL_MS + 1 }).ok).toBe(false);
  });

  it("podepsaná data: ověření a odmítnutí změny", () => {
    const token = signPayload({ a: 1 }, SECRET);
    expect(verifySignedPayload(token, SECRET)).toEqual({ a: 1 });
    expect(verifySignedPayload(token, OTHER_SECRET)).toBeNull();
    expect(verifySignedPayload(`${Buffer.from('{"a":2}').toString("base64url")}.${token.split(".")[1]}`, SECRET)).toBeNull();
    expect(verifySignedPayload("garbage", SECRET)).toBeNull();
    expect(verifySignedPayload(undefined, SECRET)).toBeNull();
  });
});

describe("pojistka — POST jen na adresy pro token", () => {
  it("token pro Authorization Code i Client Credentials projde, nic jiného ne", () => {
    expect(() => assertIdokladRequestAllowed("POST", IDOKLAD_AUTH_CODE_TOKEN_URL)).not.toThrow();
    expect(() => assertIdokladRequestAllowed("POST", IDOKLAD_TOKEN_URL)).not.toThrow();
    expect(() => assertIdokladRequestAllowed("POST", IDOKLAD_AUTHORIZE_URL)).toThrow(IdokladRequestBlockedError);
    expect(() => assertIdokladRequestAllowed("GET", IDOKLAD_AUTH_CODE_TOKEN_URL)).toThrow(IdokladRequestBlockedError);
    expect(() => assertIdokladRequestAllowed("POST", `${IDOKLAD_AUTH_CODE_TOKEN_URL}?x=1`)).toThrow(IdokladRequestBlockedError);
  });
});

describe("výměna kódu za token", () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    }) as typeof fetch;
    return { calls, fetchImpl };
  }
  const exchange = (fetchImpl: typeof fetch) =>
    exchangeAuthorizationCode({ code: CODE, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT, fetchImpl });

  it("POST na tokenovou adresu s authorization_code, bez přesměrování a cache", async () => {
    const { calls, fetchImpl } = fakeFetch(200, { access_token: "tok-1", expires_in: 3600, scope: "idoklad_api" });
    const token = await exchange(fetchImpl);
    expect(token).toEqual({ accessToken: "tok-1", expiresInSeconds: 3600, scope: "idoklad_api", refreshTokenReturned: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(IDOKLAD_AUTH_CODE_TOKEN_URL);
    expect(calls[0].init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    expect(Object.fromEntries(new URLSearchParams(String(calls[0].init.body)))).toEqual({
      grant_type: "authorization_code",
      code: CODE,
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });
  });

  it("nevyžádaný refresh token se nevrací, jen se nahlásí", async () => {
    const { fetchImpl } = fakeFetch(200, { access_token: "tok-1", refresh_token: "rt-SECRET-123", expires_in: 3600 });
    const token = await exchange(fetchImpl);
    expect(token.refreshTokenReturned).toBe(true);
    expect(JSON.stringify(token)).not.toContain("rt-SECRET-123");
  });

  it("invalid_grant → srozumitelná chyba bez kódu a tajných údajů", async () => {
    const { fetchImpl } = fakeFetch(400, {
      error: "invalid_grant",
      error_description: `code ${CODE} for client ${CLIENT_ID} secret ${CLIENT_SECRET}`,
    });
    const error = (await exchange(fetchImpl).catch((e: unknown) => e)) as IdokladError;
    expect(error).toBeInstanceOf(IdokladError);
    expect(error.code).toBe("auth_failed");
    expect(error.userMessage).toMatch(/Redirect URI/);
    const text = `${error.message} ${error.detail} ${JSON.stringify(error)}`;
    for (const secret of [CODE, CLIENT_ID, CLIENT_SECRET]) expect(text).not.toContain(secret);
  });

  it("invalid_client → odkaz na proměnné ve Vercelu", async () => {
    const { fetchImpl } = fakeFetch(401, { error: "invalid_client" });
    const error = (await exchange(fetchImpl).catch((e: unknown) => e)) as IdokladError;
    expect(error.userMessage).toMatch(/Vercel/);
  });

  it("chyba serveru s ozvěnou tajných údajů → očištěno", async () => {
    const { fetchImpl } = fakeFetch(500, `boom client_secret=${CLIENT_SECRET}&code=${CODE}`);
    const error = (await exchange(fetchImpl).catch((e: unknown) => e)) as IdokladError;
    expect(error.code).toBe("server_error");
    expect(`${error.message}`).not.toContain(CLIENT_SECRET);
    expect(`${error.message}`).not.toContain(CODE);
  });

  it("síťová chyba s tajnými údaji ve zprávě → očištěno", async () => {
    const fetchImpl = (async () => {
      throw new Error(`connect failed ${CLIENT_SECRET}`);
    }) as typeof fetch;
    const error = (await exchange(fetchImpl).catch((e: unknown) => e)) as IdokladError;
    expect(error.code).toBe("network");
    expect(error.message).not.toContain(CLIENT_SECRET);
  });

  it("odpověď bez access_token → invalid_response", async () => {
    const { fetchImpl } = fakeFetch(200, { token_type: "Bearer" });
    expect(((await exchange(fetchImpl).catch((e: unknown) => e)) as IdokladError).code).toBe("invalid_response");
  });
});

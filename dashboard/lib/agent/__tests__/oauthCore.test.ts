// GPT/MCP pilot — čisté funkce OAuth: konfigurace (výchozí stav vypnuto),
// PKCE, kontrola parametrů /oauth/authorize (žádný open redirect), klient,
// návrat po přihlášení.
import { describe, expect, it } from "vitest";
import { agentConfig, authorizationServerMetadata, protectedResourceMetadata } from "../config";
import {
  agentEligibleRoles,
  authenticateClient,
  findClient,
  authorizeRedirect,
  checkAuthorizeParams,
  hashToken,
  newToken,
  paramsFromQuery,
  pkceChallengeFor,
  queryFromParams,
  readClientCredentials,
  requestedScopes,
  safeNextPath,
  verifyPkce,
} from "../oauthCore";

const SECRET = "s".repeat(40);
const REDIRECT = "https://chatgpt.com/connector/oauth/abc123";
const ENV = {
  MCP_ISSUER: "https://moje.begina.cz",
  MCP_OAUTH_CLIENT_ID: "chatgpt-begina",
  MCP_OAUTH_CLIENT_SECRET: SECRET,
  MCP_OAUTH_REDIRECT_URIS: `${REDIRECT}, https://chatgpt.com/connector_platform_oauth_redirect`,
  MCP_ALLOWED_USER_IDS: "user-jaroslav",
};
const config = agentConfig(ENV)!;

const CLAUDE_SECRET = "c".repeat(40);
const CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const CLAUDE_ENV = {
  MCP_CLAUDE_OAUTH_CLIENT_ID: "claude-begina",
  MCP_CLAUDE_OAUTH_CLIENT_SECRET: CLAUDE_SECRET,
  MCP_CLAUDE_OAUTH_REDIRECT_URIS: CLAUDE_REDIRECT,
};
const both = agentConfig({ ...ENV, ...CLAUDE_ENV })!;

// RFC 7636, příloha B
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const validParams = {
  response_type: "code",
  client_id: "chatgpt-begina",
  redirect_uri: REDIRECT,
  state: "xyz",
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  scope: "mojebegina.read mojebegina.write",
  resource: "https://moje.begina.cz/api/mcp",
};

describe("agentConfig — výchozí stav vypnuto", () => {
  it("bez proměnných null", () => {
    expect(agentConfig({})).toBeNull();
  });

  it.each([
    ["chybí allowlist", { MCP_ALLOWED_USER_IDS: "" }],
    ["krátký secret", { MCP_OAUTH_CLIENT_SECRET: "kratky" }],
    ["issuer s lomítkem", { MCP_ISSUER: "https://moje.begina.cz/" }],
    ["issuer s cestou", { MCP_ISSUER: "https://moje.begina.cz/x" }],
    ["issuer http mimo localhost", { MCP_ISSUER: "http://moje.begina.cz" }],
    ["redirect bez https", { MCP_OAUTH_REDIRECT_URIS: "http://chatgpt.com/cb" }],
  ])("%s → null", (_label, override) => {
    expect(agentConfig({ ...ENV, ...override })).toBeNull();
  });

  it("zápisy výchozí vypnuté; zapne je jen MCP_ALLOW_WRITE=on", () => {
    expect(config.writeEnabled).toBe(false);
    expect(agentConfig({ ...ENV, MCP_ALLOW_WRITE: "on" })?.writeEnabled).toBe(true);
    expect(agentConfig({ ...ENV, MCP_ALLOW_WRITE: "true" })?.writeEnabled).toBe(false);
  });

  it("úplná konfigurace; localhost smí http", () => {
    expect(config.clients).toEqual([
      {
        integration: "chatgpt",
        label: "ChatGPT",
        clientId: "chatgpt-begina",
        clientSecret: SECRET,
        redirectUris: [REDIRECT, "https://chatgpt.com/connector_platform_oauth_redirect"],
      },
    ]);
    expect(config.allowedUserIds.has("user-jaroslav")).toBe(true);
    expect(agentConfig({ ...ENV, MCP_ISSUER: "http://localhost:3000" })?.issuer).toBe("http://localhost:3000");
  });

  it("discovery metadata ukazují na tuto aplikaci", () => {
    expect(protectedResourceMetadata(config)).toMatchObject({
      resource: "https://moje.begina.cz/api/mcp",
      authorization_servers: ["https://moje.begina.cz"],
    });
    expect(authorizationServerMetadata(config)).toMatchObject({
      issuer: "https://moje.begina.cz",
      authorization_endpoint: "https://moje.begina.cz/oauth/authorize",
      token_endpoint: "https://moje.begina.cz/api/oauth/token",
      code_challenge_methods_supported: ["S256"],
    });
  });
});

describe("tokeny a PKCE", () => {
  it("RFC 7636 testovací vektor", () => {
    expect(pkceChallengeFor(VERIFIER)).toBe(CHALLENGE);
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkce(VERIFIER.slice(0, -1) + "x", CHALLENGE)).toBe(false);
    expect(verifyPkce("kratky", pkceChallengeFor("kratky"))).toBe(false); // verifier < 43 znaků
  });

  it("tokeny jsou náhodné, s prefixem, do DB jde otisk", () => {
    const a = newToken("access");
    expect(a).toMatch(/^mba_[A-Za-z0-9_-]{43}$/);
    expect(newToken("access")).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
});

describe("agentConfig — klienti ChatGPT a Claude", () => {
  it("oba klienti; každý vlastní id, secret a redirect", () => {
    expect(both.clients.map((c) => [c.integration, c.label, c.clientId, c.redirectUris])).toEqual([
      ["chatgpt", "ChatGPT", "chatgpt-begina", [REDIRECT, "https://chatgpt.com/connector_platform_oauth_redirect"]],
      ["claude", "Claude", "claude-begina", [CLAUDE_REDIRECT]],
    ]);
  });

  it("jen Claude (bez ChatGPT) stačí; neúplný klient se ignoruje, ostatní běží", () => {
    const onlyClaude = agentConfig({ MCP_ISSUER: ENV.MCP_ISSUER, MCP_ALLOWED_USER_IDS: "user-jaroslav", ...CLAUDE_ENV });
    expect(onlyClaude?.clients.map((c) => c.integration)).toEqual(["claude"]);
    for (const broken of [
      { MCP_CLAUDE_OAUTH_CLIENT_SECRET: "kratky" },
      { MCP_CLAUDE_OAUTH_REDIRECT_URIS: "" },
      { MCP_CLAUDE_OAUTH_REDIRECT_URIS: "http://claude.ai/api/mcp/auth_callback" },
    ]) {
      expect(agentConfig({ ...ENV, ...CLAUDE_ENV, ...broken })?.clients.map((c) => c.integration), JSON.stringify(broken)).toEqual(["chatgpt"]);
    }
  });

  it("stejné client_id u obou klientů → vypnuto celé (nejednoznačné)", () => {
    expect(agentConfig({ ...ENV, ...CLAUDE_ENV, MCP_CLAUDE_OAUTH_CLIENT_ID: "chatgpt-begina" })).toBeNull();
  });

  it("findClient podle id; neznámé id null", () => {
    expect(findClient(both, "claude-begina")?.integration).toBe("claude");
    expect(findClient(both, "chatgpt-begina")?.integration).toBe("chatgpt");
    expect(findClient(both, "jiny")).toBeNull();
  });
});

describe("/oauth/authorize — kontrola parametrů", () => {
  it("platný požadavek", () => {
    const check = checkAuthorizeParams(config, validParams);
    expect(check).toEqual({
      ok: true,
      value: { clientId: "chatgpt-begina", client: config.clients[0], redirectUri: REDIRECT, state: "xyz", codeChallenge: CHALLENGE, write: true },
    });
  });

  it("Claude: vlastní redirect projde; redirect ChatGPT pro Claude (a naopak) nikdy", () => {
    const claudeParams = { ...validParams, client_id: "claude-begina", redirect_uri: CLAUDE_REDIRECT };
    const check = checkAuthorizeParams(both, claudeParams);
    expect(check.ok && check.value.client.integration).toBe("claude");
    for (const params of [
      { ...claudeParams, redirect_uri: REDIRECT },
      { ...validParams, redirect_uri: CLAUDE_REDIRECT },
    ]) {
      const crossed = checkAuthorizeParams(both, params);
      expect(crossed.ok === false && crossed.redirectable === false, JSON.stringify(params)).toBe(true);
    }
  });

  it("neznámý klient nebo cizí redirect_uri: nikdy nepřesměrovat (open redirect)", () => {
    for (const override of [
      { client_id: "jiny" },
      { redirect_uri: "https://evil.example/cb" },
      { redirect_uri: `${REDIRECT}/x` },
      { redirect_uri: undefined },
      { redirect_uri: [REDIRECT, "https://evil.example/cb"] },
    ]) {
      const check = checkAuthorizeParams(config, { ...validParams, ...override });
      expect(check.ok === false && check.redirectable === false, JSON.stringify(override)).toBe(true);
    }
  });

  it.each([
    ["response_type token", { response_type: "token" }, "unsupported_response_type"],
    ["bez PKCE", { code_challenge: undefined }, "invalid_request"],
    ["PKCE plain", { code_challenge_method: "plain" }, "invalid_request"],
    ["cizí resource", { resource: "https://evil.example/api/mcp" }, "invalid_target"],
  ])("%s → chyba zpět do ChatGPT", (_label, override, error) => {
    const check = checkAuthorizeParams(config, { ...validParams, ...override });
    expect(check).toMatchObject({ ok: false, redirectable: true, redirectUri: REDIRECT, state: "xyz", error });
  });

  it("scope: bez write jen čtení, prázdný = nabídnout obojí", () => {
    expect(requestedScopes("mojebegina.read")).toEqual({ read: true, write: false });
    expect(requestedScopes("")).toEqual({ read: true, write: true });
    expect(requestedScopes("mojebegina.write neco")).toEqual({ read: true, write: true });
  });

  it("návratová adresa nese code, state a iss", () => {
    const url = new URL(authorizeRedirect(config, REDIRECT, "xyz", { code: "mbc_1" }));
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(Object.fromEntries(url.searchParams)).toEqual({ code: "mbc_1", state: "xyz", iss: "https://moje.begina.cz" });
  });

  it("dotaz ↔ parametry; opakovaný klíč zůstane polem", () => {
    expect(paramsFromQuery("a=1&b=2&a=3")).toEqual({ a: ["1", "3"], b: "2" });
    expect(paramsFromQuery(queryFromParams(validParams))).toEqual(validParams);
  });
});

describe("ověření klienta", () => {
  const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

  it("client_secret_basic i client_secret_post", () => {
    expect(authenticateClient(config, readClientCredentials(basic("chatgpt-begina", SECRET), new URLSearchParams()))?.integration).toBe("chatgpt");
    const form = new URLSearchParams({ client_id: "chatgpt-begina", client_secret: SECRET });
    expect(authenticateClient(config, readClientCredentials(null, form))?.integration).toBe("chatgpt");
  });

  it("špatný secret, cizí id nebo nic → null", () => {
    expect(authenticateClient(config, readClientCredentials(basic("chatgpt-begina", "x"), new URLSearchParams()))).toBeNull();
    expect(authenticateClient(config, readClientCredentials(basic("jiny", SECRET), new URLSearchParams()))).toBeNull();
    expect(authenticateClient(config, readClientCredentials(null, new URLSearchParams()))).toBeNull();
    expect(authenticateClient(config, readClientCredentials("Basic !!!", new URLSearchParams()))).toBeNull();
  });

  it("dva klienti: každý jen se SVÝM secretem", () => {
    expect(authenticateClient(both, readClientCredentials(basic("claude-begina", CLAUDE_SECRET), new URLSearchParams()))?.integration).toBe("claude");
    expect(authenticateClient(both, readClientCredentials(basic("claude-begina", SECRET), new URLSearchParams()))).toBeNull();
    expect(authenticateClient(both, readClientCredentials(basic("chatgpt-begina", CLAUDE_SECRET), new URLSearchParams()))).toBeNull();
  });
});

describe("návrat po přihlášení (?next=) — jen souhlasová stránka a diagnostika DB", () => {
  it.each([
    ["/oauth/authorize?client_id=x&state=1", "/oauth/authorize?client_id=x&state=1"],
    ["/oauth/authorize", "/oauth/authorize"],
    [null, "/"],
    ["https://evil.example/oauth/authorize", "/"],
    ["//evil.example/oauth/authorize", "/"],
    ["/\\evil.example", "/"],
    ["/admin", "/"],
    ["/oauth/authorizeX", "/"],
    ["/oauth/authorize?x=1\\@evil", "/"],
    ["/diagnostika-db", "/diagnostika-db"],
    ["/diagnostika-db?x=1", "/"],
    ["/diagnostika-dbX", "/"],
    ["/diagnostika-db/../admin", "/"],
    ["//diagnostika-db", "/"],
    ["/admin/diagnostika-db", "/"],
  ])("%s → %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });
});

describe("role pro asistenta", () => {
  it("jen ADMIN a EXECUTIVE", () => {
    expect(agentEligibleRoles(["CUSTOMER", "EXECUTIVE"])).toEqual(["EXECUTIVE"]);
    expect(agentEligibleRoles(["ADMIN", "EXECUTIVE"])).toEqual(["ADMIN", "EXECUTIVE"]);
    expect(agentEligibleRoles(["CUSTOMER", "EMPLOYEE"])).toEqual([]);
  });
});

// Finance 1.0 — konfigurace OAuth testu: Production vypnuto, test se musí
// výslovně zapnout, Redirect URI jen na adresu Preview větve.
import { describe, expect, it } from "vitest";
import { resolveIdokladOAuthConfig, type IdokladOAuthEnv } from "../oauthConfig";

const BRANCH_HOST = "mojebegina-git-claude-great-bell-ffjwo3-jarin-max.vercel.app";
const REDIRECT = `https://${BRANCH_HOST}/api/idoklad/callback`;

const complete: IdokladOAuthEnv = {
  VERCEL_ENV: "preview",
  VERCEL_BRANCH_URL: BRANCH_HOST,
  IDOKLAD_OAUTH_TEST_ENABLED: "on",
  IDOKLAD_CLIENT_ID: "client-id",
  IDOKLAD_CLIENT_SECRET: "client-secret-value",
  IDOKLAD_REDIRECT_URI: REDIRECT,
  IDOKLAD_OAUTH_STATE_SECRET: "x".repeat(44),
};

describe("resolveIdokladOAuthConfig", () => {
  it("kompletní Preview konfigurace projde", () => {
    const config = resolveIdokladOAuthConfig({ ...complete, FINANCE_COMPANY_ICO: "123 45 678", FINANCE_VAT_MODE: "non_payer" });
    expect(config).toMatchObject({
      ok: true,
      clientId: "client-id",
      redirectUri: REDIRECT,
      redirectOrigin: `https://${BRANCH_HOST}`,
      companyIco: "12345678",
      vatMode: "non_payer",
    });
  });

  it("Production je vždy vypnutá — i s kompletní konfigurací", () => {
    const config = resolveIdokladOAuthConfig({ ...complete, VERCEL_ENV: "production" });
    expect(config).toMatchObject({ ok: false, production: true });
  });

  it("chybějící proměnné se hlásí jen názvem, nikdy hodnotou", () => {
    const config = resolveIdokladOAuthConfig({ ...complete, IDOKLAD_CLIENT_SECRET: "", IDOKLAD_OAUTH_STATE_SECRET: undefined });
    expect(config.ok).toBe(false);
    if (!config.ok) {
      expect(config.missing).toEqual(["IDOKLAD_CLIENT_SECRET", "IDOKLAD_OAUTH_STATE_SECRET"]);
      expect(JSON.stringify(config)).not.toContain("client-id");
    }
  });

  it("bez IDOKLAD_OAUTH_TEST_ENABLED=on vypnuto", () => {
    expect(resolveIdokladOAuthConfig({ ...complete, IDOKLAD_OAUTH_TEST_ENABLED: "true" }).ok).toBe(false);
  });

  it("krátký podpisový klíč odmítnut", () => {
    expect(resolveIdokladOAuthConfig({ ...complete, IDOKLAD_OAUTH_STATE_SECRET: "short" }).ok).toBe(false);
  });

  it("Redirect URI: jen https, přesná cesta, bez query", () => {
    for (const uri of [
      `http://${BRANCH_HOST}/api/idoklad/callback`,
      `https://${BRANCH_HOST}/api/idoklad/callback/`,
      `https://${BRANCH_HOST}/api/idoklad/callback?x=1`,
      `https://${BRANCH_HOST}/api/google-calendar/callback`,
      "not a url",
    ]) {
      expect(resolveIdokladOAuthConfig({ ...complete, IDOKLAD_REDIRECT_URI: uri }).ok).toBe(false);
    }
  });

  it("mimo Production nesmí Redirect URI mířit na moje.begina.cz", () => {
    const config = resolveIdokladOAuthConfig({
      ...complete,
      VERCEL_BRANCH_URL: undefined,
      IDOKLAD_REDIRECT_URI: "https://moje.begina.cz/api/idoklad/callback",
    });
    expect(config.ok).toBe(false);
  });

  it("Redirect URI musí odpovídat adrese větve, kterou zná Vercel", () => {
    const config = resolveIdokladOAuthConfig({ ...complete, VERCEL_BRANCH_URL: "mojebegina-git-jina-vetev-jarin-max.vercel.app" });
    expect(config.ok).toBe(false);
  });
});

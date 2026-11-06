// GPT/MCP pilot — gpt-pilot.begina.cz: výchozí 404, projde jen přesná
// dvojice metoda + cesta z AGENT_ROUTES. Ověřuje i rozpoznání domény
// (jen přesná shoda, podvržený X-Forwarded-Host omezení neobejde) a že se
// ostatní domény chovají beze změny.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import { proxy } from "@/proxy";
import { AGENT_HOST, isAgentRequest, siteForHost } from "../hosts";
import { AGENT_ROUTES, route } from "../routing";

const ORDER_ID = "11348d18-506f-45b8-b65d-65df779471c7";
const ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

const agent = (pathname: string, method = "GET", forwardedHost: string | null = null) =>
  route({ host: AGENT_HOST, forwardedHost, pathname, search: "", method }, {});

function request(url: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(url, { method: init.method ?? "GET", headers: { host: new URL(url).host, ...init.headers } });
}

/** Cesty, které na pilotní doméně musí vrátit 404 při jakékoli metodě. */
const DENIED = [
  // e-shop a pokladna (s prefixem i bez něj), stav objednávky, webhook
  "/eshop",
  "/eshop/",
  "/eshop/kosik",
  "/eshop/pokladna",
  "/eshop/produkt/kulajda",
  "/eshop/kategorie/sirupy",
  `/eshop/objednavka/${ORDER_ID}`,
  "/eshop/nenalezeno",
  "/eshop/robots.txt",
  "/eshop/sitemap.xml",
  "/kosik",
  "/pokladna",
  `/objednavka/${ORDER_ID}`,
  "/produkt/kulajda",
  "/api/eshop/stripe/webhook",
  "/gdpr",
  "/obchodni-podminky",
  "/doprava",
  // reset hesla a ostatní Neon Auth
  "/nastavit-heslo",
  "/api/auth/forget-password",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/auth/sign-up/email",
  "/api/auth/get-session",
  "/api/auth/sign-out",
  "/api/auth/token",
  "/api/auth/sign-in/social",
  "/api/auth/callback/google",
  "/api/auth",
  // interní stránky MojeBegina
  "/",
  "/admin",
  "/admin/novy-zakaznik",
  "/admin/backfill-user-profiles-once",
  "/executive",
  "/rizeni-firmy",
  "/rizeni-firmy/asistent",
  "/rizeni-firmy/obchod",
  "/rizeni-firmy/objednavky/idoklad",
  "/diagnostika-db",
  "/profil",
  "/objednavky",
  "/partnersky-program",
  "/vyhoda/partnerska-sleva",
  "/upozorneni",
  "/vyber-roli",
  "/doporucit",
  "/sitemap.xml",
  "/logo-begina-mark.png",
  // varianty povolených cest — lomítko, další část, velikost písmen, kódování
  "/api/mcp/",
  "/api/mcp/x",
  "/api/mcp.json",
  "/API/MCP",
  "/api/Mcp",
  "/api/%6dcp",
  "/api/mcp%2F",
  "/api/mcp%00",
  "//api/mcp",
  "/api/mcp;x",
  "/api/oauth/token/",
  "/api/oauth/Token",
  "/api/oauth",
  "/oauth/authorize/",
  "/oauth/Authorize",
  "/oauth",
  "/login/",
  "/login/x",
  "/Login",
  "/login.html",
  "/api/auth/sign-in/email/",
  "/api/auth/sign-in/EMAIL",
  "/api/auth/sign-in/email%2F",
  "/api/auth/sign-in",
  "/.well-known/oauth-authorization-server/",
  "/.well-known/oauth-protected-resource/api/mcp/",
  "/.well-known/oauth-protected-resource/x",
  "/.well-known/openid-configuration",
  "/.well-known",
  // klíče objektu nesmí projít jako povolená cesta
  "/__proto__",
  "constructor",
  "/constructor",
  "/toString",
  "/hasOwnProperty",
];

describe("rozpoznání pilotní domény", () => {
  it("jen přesné gpt-pilot.begina.cz (velikost písmen, port a tečka na konci DNS nemění)", () => {
    for (const host of ["gpt-pilot.begina.cz", "GPT-Pilot.Begina.CZ", "gpt-pilot.begina.cz:443", "gpt-pilot.begina.cz."]) {
      expect(siteForHost(host), host).toBe("agent");
    }
    for (const host of [
      "x.gpt-pilot.begina.cz",
      "gpt-pilot.begina.cz.evil.example",
      "gpt-pilot-begina.cz",
      "gptpilot.begina.cz",
      "gpt-pilot.begina.com",
      "gpt-pilot2.begina.cz",
      "moje.begina.cz",
      "begina.cz",
      "mojebegina-git-claude-upbeat-goodall-pj64t5-jarin-max.vercel.app",
      "",
    ]) {
      expect(siteForHost(host), host).not.toBe("agent");
    }
  });

  it("X-Forwarded-Host může omezení jen přidat, nikdy obejít", () => {
    expect(isAgentRequest(AGENT_HOST, "moje.begina.cz")).toBe(true);
    expect(isAgentRequest(AGENT_HOST, null)).toBe(true);
    expect(isAgentRequest("moje.begina.cz", AGENT_HOST)).toBe(true);
    expect(isAgentRequest("moje.begina.cz", `begina.cz, ${AGENT_HOST}`)).toBe(true);
    expect(isAgentRequest("moje.begina.cz", "begina.cz")).toBe(false);
    expect(isAgentRequest("moje.begina.cz", null)).toBe(false);
    // spoof na pilotní doméně → pořád 404
    expect(agent("/eshop/pokladna", "GET", "moje.begina.cz")).toEqual({ kind: "deny" });
    expect(agent("/rizeni-firmy", "GET", "mojebegina-git-x-jarin-max.vercel.app")).toEqual({ kind: "deny" });
  });
});

describe("gpt-pilot.begina.cz — povolený seznam", () => {
  it("povolená dvojice metoda + cesta projde jako interní aplikace", () => {
    const allowed: Array<[string, string]> = [];
    for (const [path, methods] of Object.entries(AGENT_ROUTES)) for (const method of methods) allowed.push([path, method]);
    expect(allowed).toEqual(
      expect.arrayContaining([
        ["/.well-known/oauth-authorization-server", "GET"],
        ["/.well-known/oauth-protected-resource/api/mcp", "GET"],
        ["/api/mcp", "POST"],
        ["/api/oauth/token", "POST"],
        ["/oauth/authorize", "GET"],
        ["/oauth/authorize", "POST"],
        ["/login", "GET"],
        ["/api/auth/sign-in/email", "POST"],
      ])
    );
    for (const [path, method] of allowed) {
      expect(agent(path, method), `${method} ${path}`).toEqual({ kind: "pass", site: "internal" });
      expect(agent(path, method.toLowerCase()), `${method} ${path}`).toEqual({ kind: "pass", site: "internal" });
    }
  });

  it("stejná cesta s jinou metodou → 404", () => {
    for (const [path, methods] of Object.entries(AGENT_ROUTES)) {
      for (const method of ALL_METHODS.filter((m) => !methods.includes(m))) {
        expect(agent(path, method), `${method} ${path}`).toEqual({ kind: "deny" });
      }
    }
    expect(agent("/login", "POST")).toEqual({ kind: "deny" });
    expect(agent("/api/auth/sign-in/email", "GET")).toEqual({ kind: "deny" });
    expect(agent("/api/oauth/token", "GET")).toEqual({ kind: "deny" });
  });

  it("e-shop, pokladna, webhook, reset hesla, interní stránky a varianty cest → 404 při jakékoli metodě", () => {
    for (const path of DENIED) {
      for (const method of ALL_METHODS) {
        expect(agent(path, method), `${method} ${path}`).toEqual({ kind: "deny" });
      }
    }
  });

  it("Neon Auth: povolený je jediný endpoint (přihlášení e-mailem)", () => {
    const auth = Object.keys(AGENT_ROUTES).filter((path) => path.startsWith("/api/auth"));
    expect(auth).toEqual(["/api/auth/sign-in/email"]);
    expect(AGENT_ROUTES["/api/auth/sign-in/email"]).toEqual(["POST"]);
  });
});

describe("proxy.ts na pilotní doméně", () => {
  it("zakázaná cesta → prostá 404, ne stránka e-shopu ani přepis, noindex, no-store", async () => {
    for (const path of ["/eshop", "/eshop/pokladna", "/pokladna", "/api/eshop/stripe/webhook", "/nastavit-heslo", "/", "/rizeni-firmy"]) {
      const response = proxy(request(`https://${AGENT_HOST}${path}`));
      expect(response.status, path).toBe(404);
      expect(isRewrite(response), path).toBe(false);
      expect(response.headers.get("x-middleware-next"), path).toBeNull();
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).toBe("Not Found");
    }
    const webhook = proxy(request(`https://${AGENT_HOST}/api/eshop/stripe/webhook`, { method: "POST" }));
    expect(webhook.status).toBe(404);
    const reset = proxy(request(`https://${AGENT_HOST}/api/auth/request-password-reset`, { method: "POST" }));
    expect(reset.status).toBe(404);
    const checkoutAction = proxy(
      request(`https://${AGENT_HOST}/eshop/pokladna`, { method: "POST", headers: { "next-action": "abc123" } })
    );
    expect(checkoutAction.status).toBe(404);
  });

  it("povolená cesta projde s hlavičkou internal; dotaz (?…) nevadí", () => {
    const authorize = proxy(request(`https://${AGENT_HOST}/oauth/authorize?response_type=code&client_id=x&state=1`));
    expect(authorize.headers.get("x-middleware-next")).toBe("1");
    expect(authorize.headers.get("x-middleware-request-x-begina-site")).toBe("internal");
    const mcp = proxy(request(`https://${AGENT_HOST}/api/mcp`, { method: "POST" }));
    expect(mcp.headers.get("x-middleware-next")).toBe("1");
    const signIn = proxy(request(`https://${AGENT_HOST}/api/auth/sign-in/email`, { method: "POST" }));
    expect(signIn.headers.get("x-middleware-next")).toBe("1");
  });

  it("zakódované obcházení a ../ se normalizují dřív, než proxy rozhoduje", () => {
    for (const url of [
      `https://${AGENT_HOST}/api/mcp/%2e%2e/eshop/pokladna`,
      `https://${AGENT_HOST}/api/mcp/%2E%2E/%2E%2E/eshop`,
      `https://${AGENT_HOST}/oauth/authorize/../../eshop/kosik`,
      `https://${AGENT_HOST}/login/..%2feshop`,
      `https://${AGENT_HOST}/api/%6dcp`,
    ]) {
      expect(proxy(request(url)).status, url).toBe(404);
    }
  });

  it("podvržený X-Forwarded-Host omezení neobejde", () => {
    const spoofed = proxy(
      request(`https://${AGENT_HOST}/eshop/pokladna`, { headers: { "x-forwarded-host": "moje.begina.cz" } })
    );
    expect(spoofed.status).toBe(404);
  });

  it("ostatní domény beze změny: moje.begina.cz a Preview projdou, begina.cz dál přepisuje na e-shop", () => {
    for (const host of ["moje.begina.cz", "mojebegina-git-claude-upbeat-goodall-pj64t5-jarin-max.vercel.app", "localhost:3000"]) {
      for (const path of ["/", "/eshop/pokladna", "/rizeni-firmy", "/api/auth/get-session", "/nastavit-heslo"]) {
        const response = proxy(request(`https://${host}${path}`));
        expect(response.headers.get("x-middleware-next"), `${host}${path}`).toBe("1");
        expect(response.headers.get("x-middleware-request-x-begina-site")).toBe("internal");
      }
    }
    const shop = proxy(request("https://begina.cz/pokladna"));
    expect(getRewrittenUrl(shop)).toBe("https://begina.cz/eshop/pokladna");
    const shop404 = proxy(request("https://begina.cz/api/mcp", { method: "POST" }));
    expect(getRewrittenUrl(shop404)).toBe("https://begina.cz/eshop/nenalezeno");
  });
});

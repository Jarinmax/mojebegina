// proxy.ts — skutečná funkce nad NextRequest: přepis, přesměrování, 404/410,
// hlavička domény pro stránky (nelze podvrhnout) a X-Robots-Tag.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl, getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "@/proxy";
import { SITE_HEADER } from "../hosts";

const ORDER_ID = "11348d18-506f-45b8-b65d-65df779471c7";

function request(url: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  const host = new URL(url).host;
  return new NextRequest(url, { method: init.method ?? "GET", headers: { host, ...init.headers } });
}

/** Hlavička, kterou proxy předá stránce (NextResponse.next/rewrite s request.headers). */
function forwardedSite(response: Response): string | null {
  return response.headers.get(`x-middleware-request-${SITE_HEADER}`);
}

afterEach(() => vi.unstubAllEnvs());

describe("proxy.ts", () => {
  it("begina.cz: stránka e-shopu → přepis na /eshop/… s hlavičkou domény public", () => {
    const response = proxy(request("https://begina.cz/produkt/kulajda?_rsc=abc"));
    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe("https://begina.cz/eshop/produkt/kulajda?_rsc=abc");
    expect(forwardedSite(response)).toBe("public");
  });

  it("hlavičku domény od klienta nejde podvrhnout (vždy přepsaná)", () => {
    const spoofedInternal = proxy(request("https://moje.begina.cz/eshop", { headers: { [SITE_HEADER]: "public" } }));
    expect(forwardedSite(spoofedInternal)).toBe("internal");
    const spoofedPublic = proxy(request("https://begina.cz/kosik", { headers: { [SITE_HEADER]: "internal" } }));
    expect(forwardedSite(spoofedPublic)).toBe("public");
  });

  it("begina.cz: MojeBegina → přepis na e-shopovou 404, noindex", () => {
    for (const path of ["/login", "/api/auth/get-session", "/rizeni-firmy", "/api/eshop/stripe/webhook"]) {
      const response = proxy(request(`https://begina.cz${path}`));
      expect(getRewrittenUrl(response), path).toBe("https://begina.cz/eshop/nenalezeno");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  });

  it("www → 301 na https://begina.cz; WordPress → 410", () => {
    const www = proxy(request("https://www.begina.cz/o-nas?x=1"));
    expect(www.status).toBe(301);
    expect(getRedirectUrl(www)).toBe("https://begina.cz/o-nas?x=1");
    const gone = proxy(request("https://begina.cz/wp-login.php"));
    expect(gone.status).toBe(410);
  });

  it("moje.begina.cz: bez přepínače jen projde (hlavička internal, noindex) — MojeBegina beze změny", () => {
    for (const path of ["/", "/login", "/api/auth/get-session", "/eshop/produkt/kulajda", `/eshop/objednavka/${ORDER_ID}`]) {
      const response = proxy(request(`https://moje.begina.cz${path}`));
      expect(isRewrite(response), path).toBe(false);
      expect(getRedirectUrl(response), path).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(forwardedSite(response)).toBe("internal");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      // proxy nikdy nesahá na cookies (přihlášení zůstává jen na moje.begina.cz)
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("moje.begina.cz se zapnutým přesměrováním: stará stránka objednávky → begina.cz se stejným id a parametry", () => {
    vi.stubEnv("ESHOP_CANONICAL_ORIGIN", "https://begina.cz");
    const response = proxy(request(`https://moje.begina.cz/eshop/objednavka/${ORDER_ID}?platba=ok`));
    expect(response.status).toBe(301);
    expect(getRedirectUrl(response)).toBe(`https://begina.cz/objednavka/${ORDER_ID}?platba=ok`);
    // odpověď přesměrování nenese žádná data objednávky
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("indexace: noindex na begina.cz, dokud není ESHOP_INDEXING=on; moje.begina.cz vždy noindex", () => {
    expect(proxy(request("https://begina.cz/")).headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    vi.stubEnv("ESHOP_INDEXING", "on");
    expect(proxy(request("https://begina.cz/")).headers.get("X-Robots-Tag")).toBeNull();
    expect(proxy(request("https://moje.begina.cz/")).headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("matcher: proxy běží na stránkách i API, ne na sestavených souborech a optimalizaci obrázků", () => {
    const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    for (const url of ["/", "/login", "/api/auth/get-session", "/produkt/kulajda", "/eshop/kulajda.jpg", "/robots.txt"]) {
      expect(runs(url), url).toBe(true);
    }
    for (const url of ["/_next/static/chunks/a.js", "/_next/image?url=%2Feshop%2Fkulajda.jpg&w=640&q=75"]) {
      expect(runs(url), url).toBe(false);
    }
  });
});

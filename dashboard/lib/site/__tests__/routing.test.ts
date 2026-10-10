// Rozlišení domén — tabulka pravidel (lib/site/routing.ts) a úplné ověření
// proti skutečným souborům aplikace:
//   1) na begina.cz je dostupné všechno, co e-shop potřebuje k objednání
//      (každá stránka a route handler z app/eshop, serverové akce = POST na
//      stránku, statické soubory z public/eshop, /_next),
//   2) na begina.cz NENÍ dostupné nic z MojeBegina (každá stránka a API
//      mimo app/eshop),
//   3) moje.begina.cz se bez přepínačů chová jako dosud.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeHost, siteForHost, siteFromHeader } from "../hosts";
import { canonicalRedirectEnabled, indexingEnabled } from "../flags";
import { LEGACY_PRODUCT_SLUGS, publicEshopPath, route, type RouteDecision } from "../routing";

const ROOT = path.join(__dirname, "../../..");
const ORDER_ID = "11348d18-506f-45b8-b65d-65df779471c7";
const ON = { ESHOP_CANONICAL_ORIGIN: "https://begina.cz" };

const get = (host: string | null, pathname: string, env: Record<string, string | undefined> = {}, search = "") =>
  route({ host, pathname, search, method: "GET" }, env);
const post = (host: string, pathname: string, env: Record<string, string | undefined> = {}) =>
  route({ host, pathname, search: "", method: "POST" }, env);

function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (name === "__tests__" || name === "node_modules") return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

/** app/x/[id]/page.tsx → /x/<vzorek>; route groups a catch-all vynechat. */
function urlOf(file: string, sample: Record<string, string>): string | null {
  const segments = file.replace(/^app/, "").replace(/\/(page\.tsx|route\.ts)$/, "").split("/").filter(Boolean);
  if (segments.some((s) => s.startsWith("[..."))) return null;
  return "/" + segments.map((s) => (s.startsWith("[") ? sample[s] ?? "x" : s)).join("/");
}

describe("domény", () => {
  it("normalizace a rozpoznání (velká písmena, port, tečka na konci); jiná = interní", () => {
    expect(normalizeHost("Begina.CZ:443")).toBe("begina.cz");
    expect(normalizeHost("begina.cz.")).toBe("begina.cz");
    expect(normalizeHost("[::1]:3000")).toBe("[::1]");
    expect(normalizeHost(null)).toBe("");
    expect(siteForHost("begina.cz")).toBe("public");
    expect(siteForHost("BEGINA.cz:3100")).toBe("public");
    expect(siteForHost("www.begina.cz")).toBe("www");
    for (const host of ["moje.begina.cz", "mojebegina-git-x.vercel.app", "localhost:3000", "evilbegina.cz", "begina.cz.evil.com", "xbegina.cz", "", null]) {
      expect(siteForHost(host), String(host)).toBe("internal");
    }
    expect(siteFromHeader("public")).toBe("public");
    for (const value of ["internal", "PUBLIC", "", null, undefined]) expect(siteFromHeader(value)).toBe("internal");
  });

  it("přepínače jsou ve výchozím stavu vypnuté; zapne je jen přesná hodnota; Preview je ignoruje", () => {
    expect(canonicalRedirectEnabled({})).toBe(false);
    expect(indexingEnabled({})).toBe(false);
    expect(canonicalRedirectEnabled(ON)).toBe(true);
    expect(canonicalRedirectEnabled({ ...ON, VERCEL_ENV: "production" })).toBe(true);
    expect(indexingEnabled({ ESHOP_INDEXING: "on", VERCEL_ENV: "production" })).toBe(true);
    for (const value of ["https://evil.cz", "http://begina.cz", "https://www.begina.cz", "https://begina.cz/", "begina.cz", "on", "1", ""]) {
      expect(canonicalRedirectEnabled({ ESHOP_CANONICAL_ORIGIN: value }), value).toBe(false);
    }
    for (const value of ["true", "1", "ON", "yes", ""]) expect(indexingEnabled({ ESHOP_INDEXING: value }), value).toBe(false);
    expect(canonicalRedirectEnabled({ ...ON, VERCEL_ENV: "preview" })).toBe(false);
    expect(indexingEnabled({ ESHOP_INDEXING: "on", VERCEL_ENV: "preview" })).toBe(false);
  });
});

describe("begina.cz — stránky e-shopu bez /eshop", () => {
  it.each([
    ["/", "/eshop"],
    ["/produkt/kulajda", "/eshop/produkt/kulajda"],
    ["/kategorie/sirupy", "/eshop/kategorie/sirupy"],
    ["/kosik", "/eshop/kosik"],
    ["/pokladna", "/eshop/pokladna"],
    [`/objednavka/${ORDER_ID}`, `/eshop/objednavka/${ORDER_ID}`],
    ["/doprava", "/eshop/doprava"],
    ["/o-nas", "/eshop/o-nas"],
    ["/o-vode", "/eshop/o-vode"],
    ["/obchodni-podminky", "/eshop/obchodni-podminky"],
    ["/ochrana-osobnich-udaju", "/eshop/ochrana-osobnich-udaju"],
    ["/robots.txt", "/eshop/robots.txt"],
    ["/sitemap.xml", "/eshop/sitemap.xml"],
  ])("%s → %s", (pathname, target) => {
    expect(get("begina.cz", pathname)).toEqual({ kind: "rewrite", path: target });
  });

  it("serverové akce (POST na stránku) projdou: odeslání pokladny i „Zaplatit znovu“", () => {
    expect(post("begina.cz", "/pokladna")).toEqual({ kind: "rewrite", path: "/eshop/pokladna" });
    expect(post("begina.cz", `/objednavka/${ORDER_ID}`)).toEqual({ kind: "rewrite", path: `/eshop/objednavka/${ORDER_ID}` });
    expect(post("begina.cz", "/produkt/kulajda")).toEqual({ kind: "rewrite", path: "/eshop/produkt/kulajda" });
  });

  it("statické soubory a sestavená aplikace projdou beze změny", () => {
    for (const pathname of [
      "/_next/static/chunks/app.js",
      "/_next/image",
      "/favicon.ico",
      "/logo-begina-mark.png",
      "/eshop/kulajda.jpg",
      "/eshop/hero/bag-in-box.webp",
      "/eshop/hero/ikona-polevky.webp",
    ]) {
      expect(get("begina.cz", pathname), pathname).toEqual({ kind: "pass", site: "public" });
    }
  });

  it("parametry stránek musí mít platný tvar, jinak 404", () => {
    for (const pathname of [
      "/produkt/Kulajda",
      "/produkt/kul_ajda",
      "/produkt/kulajda/extra",
      "/produkt/",
      "/kategorie/a%2Fb",
      "/objednavka/123",
      `/objednavka/${ORDER_ID}/x`,
    ]) {
      const decision = get("begina.cz", pathname);
      expect(["notFound", "redirect"], pathname).toContain(decision.kind);
      expect(decision.kind === "rewrite" || decision.kind === "pass", pathname).toBe(false);
    }
  });
});

describe("begina.cz — MojeBegina je nedostupná (výchozí zákaz)", () => {
  it.each([
    "/login",
    "/admin",
    "/admin/novy-zakaznik",
    "/rizeni-firmy",
    "/rizeni-firmy/objednavky",
    "/objednavky",
    "/profil",
    "/nastavit-heslo",
    "/vyber-roli",
    "/upozorneni",
    "/executive",
    "/partnersky-program",
    "/doporucit",
    "/api/auth/get-session",
    "/api/auth/sign-in/email",
    "/api/eshop/stripe/webhook",
    "/eshop/../login",
    "//login",
    "/%2e%2e/login",
    "/LOGIN",
    "/.env",
    "/.well-known/security.txt",
    "/next.svg",
    "/eshop/robots.txt.bak",
  ])("GET %s → 404", (pathname) => {
    expect(get("begina.cz", pathname)).toEqual({ kind: "notFound" });
  });

  it.each(["/login", "/api/auth/sign-in/email", "/api/eshop/stripe/webhook", "/rizeni-firmy/objednavky", "/", "/admin"])(
    "POST %s nikdy neprojde do MojeBegina",
    (pathname) => {
      const decision = post("begina.cz", pathname);
      if (pathname === "/") expect(decision).toEqual({ kind: "rewrite", path: "/eshop" });
      else expect(decision).toEqual({ kind: "notFound" });
    }
  );

  it("každá stránka a API MojeBegina (app/ mimo app/eshop) je na begina.cz 404", () => {
    const files = walk("app").filter((f) => /\/(page\.tsx|route\.ts)$/.test(f) && !f.startsWith("app/eshop/"));
    expect(files.length).toBeGreaterThan(25);
    const sample = { "[id]": "11348d18-506f-45b8-b65d-65df779471c7" };
    for (const file of files) {
      const url = urlOf(file, sample);
      if (url === null) {
        // catch-all (api/auth/[...path]) — vzorky
        for (const p of ["/api/auth/get-session", "/api/auth/x/y"]) expect(get("begina.cz", p), file).toEqual({ kind: "notFound" });
        continue;
      }
      if (url === "/") continue; // kořen = úvod e-shopu (ne MojeBegina)
      for (const method of ["GET", "POST"]) {
        const decision = route({ host: "begina.cz", pathname: url, search: "", method }, {});
        expect(decision.kind === "rewrite" || decision.kind === "pass", `${method} ${url} (${file})`).toBe(false);
      }
    }
  });

  it("kořen begina.cz je úvod e-shopu, nikdy nástěnka MojeBegina", () => {
    expect(get("begina.cz", "/")).toEqual({ kind: "rewrite", path: "/eshop" });
  });
});

describe("begina.cz — vše, co e-shop potřebuje, je dostupné", () => {
  it("každá stránka a route handler z app/eshop má na begina.cz adresu, která se přepíše přesně na něj", () => {
    const files = walk("app/eshop").filter((f) => /\/(page\.tsx|route\.ts)$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(13);
    const sample = { "[slug]": "kulajda", "[id]": ORDER_ID };
    for (const file of files) {
      const internal = urlOf(file, sample);
      if (internal === null) continue; // [...nenalezeno] = 404
      const publicPath = internal === "/eshop" ? "/" : internal.slice("/eshop".length);
      expect(publicEshopPath(publicPath), file).toBe(internal);
      expect(get("begina.cz", publicPath), file).toEqual({ kind: "rewrite", path: internal });
    }
  });

  it("každý soubor z public/eshop a logo projde", () => {
    const assets = walk("public/eshop").map((f) => f.replace(/^public/, ""));
    expect(assets.length).toBeGreaterThan(20);
    for (const asset of [...assets, "/logo-begina-mark.png"]) {
      expect(get("begina.cz", asset), asset).toEqual({ kind: "pass", site: "public" });
    }
  });
});

describe("begina.cz — staré adresy (WordPress, /eshop)", () => {
  it("lomítko na konci → 301 bez něj (parametry zůstanou)", () => {
    expect(get("begina.cz", "/produkt/kulajda/", {}, "?a=1")).toEqual({
      kind: "redirect",
      location: "https://begina.cz/produkt/kulajda?a=1",
      status: 301,
    });
    expect(get("begina.cz", "/o-nas/")).toEqual({ kind: "redirect", location: "https://begina.cz/o-nas", status: 301 });
  });

  it.each([
    ["/gdpr", "https://begina.cz/ochrana-osobnich-udaju"],
    ["/kategorie-produktu/sirupy", "https://begina.cz/kategorie/sirupy"],
    ["/kategorie-produktu/caje/page/2", "https://begina.cz/kategorie/caje"],
    ["/obchod", "https://begina.cz/"],
    ["/shop", "https://begina.cz/"],
    ["/muj-ucet", "https://begina.cz/"],
    ["/muj-ucet/orders", "https://begina.cz/"],
    ["/eshop", "https://begina.cz/"],
    ["/eshop/produkt/kulajda", "https://begina.cz/produkt/kulajda"],
    [`/eshop/objednavka/${ORDER_ID}`, `https://begina.cz/objednavka/${ORDER_ID}`],
  ])("%s → 301 %s", (pathname, location) => {
    expect(get("begina.cz", pathname)).toEqual({ kind: "redirect", location, status: 301 });
  });

  it("stará stránka objednávky s parametry: parametry zůstanou, cíl je vždy https://begina.cz", () => {
    expect(get("begina.cz", `/eshop/objednavka/${ORDER_ID}`, {}, "?platba=ok")).toEqual({
      kind: "redirect",
      location: `https://begina.cz/objednavka/${ORDER_ID}?platba=ok`,
      status: 301,
    });
  });

  it("/eshop/<cokoli neznámého> se nepřesměruje, ale je 404 (žádné řetězení na neexistující adresu)", () => {
    expect(get("begina.cz", "/eshop/login")).toEqual({ kind: "notFound" });
    expect(get("begina.cz", "/eshop/objednavka/123")).toEqual({ kind: "notFound" });
  });

  it.each(["/wp-admin", "/wp-admin/post.php", "/wp-login.php", "/xmlrpc.php", "/wp-json/wp/v2/users", "/feed", "/comments/feed", "/wp-includes/x.js"])(
    "%s → 410",
    (pathname) => {
      expect(get("begina.cz", pathname)).toEqual({ kind: "gone" });
    }
  );

  it("přejmenované produkty (z exportu WordPressu) → 301; tabulka zatím prázdná", () => {
    expect(LEGACY_PRODUCT_SLUGS).toEqual({});
  });
});

describe("www.begina.cz → begina.cz", () => {
  it("GET/HEAD 301, ostatní 308; cesta i parametry zůstanou", () => {
    expect(get("www.begina.cz", "/produkt/kulajda", {}, "?x=1")).toEqual({
      kind: "redirect",
      location: "https://begina.cz/produkt/kulajda?x=1",
      status: 301,
    });
    expect(route({ host: "WWW.begina.cz:443", pathname: "/", search: "", method: "HEAD" }, {})).toMatchObject({ status: 301 });
    expect(post("www.begina.cz", "/pokladna")).toEqual({ kind: "redirect", location: "https://begina.cz/pokladna", status: 308 });
    // i stránky MojeBegina jen přesměruje na begina.cz (kde jsou 404), nikdy neobslouží
    expect(get("www.begina.cz", "/login")).toEqual({ kind: "redirect", location: "https://begina.cz/login", status: 301 });
  });
});

describe("moje.begina.cz — beze změny, dokud se nezapne přepínač", () => {
  const internalHosts = ["moje.begina.cz", "mojebegina-git-x-jarin-max.vercel.app", "localhost:3000", null];

  it("bez přepínačů: vše projde jako dosud (MojeBegina, /eshop, API, přihlášení)", () => {
    for (const host of internalHosts) {
      for (const pathname of [
        "/",
        "/login",
        "/rizeni-firmy/objednavky",
        "/api/auth/get-session",
        "/api/eshop/stripe/webhook",
        "/eshop",
        "/eshop/produkt/kulajda",
        `/eshop/objednavka/${ORDER_ID}`,
        "/eshop/kulajda.jpg",
        "/robots.txt",
      ]) {
        expect(get(host, pathname), `${host} ${pathname}`).toEqual({ kind: "pass", site: "internal" });
        expect(post(host ?? "", pathname), `${host} POST ${pathname}`).toEqual({ kind: "pass", site: "internal" });
      }
    }
  });

  it("dosavadní dočasná přesměrování /gdpr, /obchodni-podminky, /doprava (307 na /eshop/…)", () => {
    expect(get("moje.begina.cz", "/gdpr")).toEqual({ kind: "redirect", location: "/eshop/ochrana-osobnich-udaju", status: 307 });
    expect(get("moje.begina.cz", "/gdpr/")).toEqual({ kind: "redirect", location: "/eshop/ochrana-osobnich-udaju", status: 307 });
    expect(get("moje.begina.cz", "/obchodni-podminky")).toEqual({ kind: "redirect", location: "/eshop/obchodni-podminky", status: 307 });
    expect(get("moje.begina.cz", "/doprava")).toEqual({ kind: "redirect", location: "/eshop/doprava", status: 307 });
  });

  it("s ESHOP_CANONICAL_ORIGIN: stránky e-shopu → 301 na begina.cz (i stará stránka objednávky s parametry)", () => {
    expect(get("moje.begina.cz", `/eshop/objednavka/${ORDER_ID}`, ON, "?platba=ok")).toEqual({
      kind: "redirect",
      location: `https://begina.cz/objednavka/${ORDER_ID}?platba=ok`,
      status: 301,
    });
    expect(get("moje.begina.cz", "/eshop", ON)).toEqual({ kind: "redirect", location: "https://begina.cz/", status: 301 });
    expect(get("moje.begina.cz", "/eshop/produkt/kulajda", ON)).toMatchObject({ location: "https://begina.cz/produkt/kulajda" });
    expect(get("moje.begina.cz", "/gdpr", ON)).toEqual({ kind: "redirect", location: "https://begina.cz/ochrana-osobnich-udaju", status: 301 });
  });

  it("s ESHOP_CANONICAL_ORIGIN: MojeBegina, API, fotky a rozpracované odeslání pokladny (POST) zůstanou", () => {
    for (const pathname of ["/", "/login", "/rizeni-firmy/objednavky", "/api/auth/get-session", "/api/eshop/stripe/webhook", "/eshop/kulajda.jpg"]) {
      expect(get("moje.begina.cz", pathname, ON), pathname).toEqual({ kind: "pass", site: "internal" });
    }
    expect(post("moje.begina.cz", "/eshop/pokladna", ON)).toEqual({ kind: "pass", site: "internal" });
  });

  it("Preview přepínač ignoruje — nikdy nepošle zákazníka na produkční doménu", () => {
    const preview = { ...ON, VERCEL_ENV: "preview" };
    expect(get("mojebegina-git-x.vercel.app", "/eshop/produkt/kulajda", preview)).toEqual({ kind: "pass", site: "internal" });
  });

  it("přesměrování vede vždy na pevnou adresu https://begina.cz — Host ani parametry cíl nezmění", () => {
    const decisions: RouteDecision[] = [
      get("moje.begina.cz", "/eshop/x", ON, "?next=https://evil.cz"),
      get("www.begina.cz", "//evil.cz/x"),
      get("begina.cz", "/eshop/produkt/kulajda", {}, "?redirect=//evil.cz"),
      get("begina.cz", "/produkt/kulajda/", {}, "?u=https://evil.cz"),
    ];
    for (const decision of decisions) {
      if (decision.kind !== "redirect") continue;
      expect(new URL(decision.location, "https://moje.begina.cz").origin).toMatch(/^https:\/\/(begina\.cz|moje\.begina\.cz)$/);
    }
  });
});

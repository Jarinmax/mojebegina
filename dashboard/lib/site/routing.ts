// Rozhodnutí proxy.ts pro každý požadavek: doména + cesta → co se stane.
// Čistá funkce (bez Next.js), aby šla otestovat tabulkou případů
// (lib/site/__tests__/routing.test.ts).
//
// begina.cz — VÝCHOZÍ ZÁKAZ: projde jen to, co je výslovně povolené
//   (stránky e-shopu, jeho statické soubory, robots/sitemap). Vše ostatní
//   = 404 — přihlášení, administrace, API (/api/auth, Stripe webhook),
//   stránky MojeBegina ani jejich serverové akce se přes begina.cz
//   nedají otevřít. Cesty e-shopu se interně obslouží stránkami
//   z app/eshop (rewrite /produkt/x → /eshop/produkt/x).
// www.begina.cz — 301 na begina.cz (cesta i parametry zůstanou).
// moje.begina.cz / Preview / localhost — beze změny jako dosud; jen po
//   zapnutí ESHOP_CANONICAL_ORIGIN se /eshop/… přesměruje na begina.cz.
// gpt-pilot.begina.cz — VÝCHOZÍ ZÁKAZ pro pilot asistenta ChatGPT: projde
//   jen přesná dvojice metoda + cesta z AGENT_ROUTES (discovery, /api/mcp,
//   OAuth, přihlášení). Vše ostatní — e-shop, pokladna, webhook, reset
//   hesla, interní stránky — prostá 404 (ne e-shopová stránka).
import { PUBLIC_ORIGIN, isAgentRequest, siteForHost, type Site } from "./hosts";
import { canonicalRedirectEnabled } from "./flags";

type Env = Record<string, string | undefined>;

export type RouteInput = {
  host: string | null;
  /** X-Forwarded-Host — jen aby podvržená hodnota nemohla omezení pilotní domény obejít */
  forwardedHost?: string | null;
  /** request.nextUrl.pathname — už normalizovaná (bez /./ a /../) */
  pathname: string;
  /** "" nebo "?…" */
  search: string;
  method: string;
};

export type RouteDecision =
  | { kind: "pass"; site: "public" | "internal" }
  | { kind: "rewrite"; path: string }
  | { kind: "redirect"; location: string; status: 301 | 307 | 308 }
  | { kind: "notFound" }
  /** prostá 404 bez stránky aplikace (pilotní doména) */
  | { kind: "deny" }
  | { kind: "gone" };

/** Kam se interně přepíše neznámá adresa na begina.cz — e-shopová 404 (app/eshop/[...nenalezeno]). */
export const PUBLIC_NOT_FOUND_PATH = "/eshop/nenalezeno";

const ESHOP_PREFIX = "/eshop";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Statické soubory e-shopu (public/eshop/…) — fotky produktů, ikony, hero. */
const ESHOP_ASSET = /^\/eshop\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp|avif|gif|svg|ico)$/;
/** Soubory z kořene public/ a app/, které e-shop používá. */
const ROOT_ASSETS = new Set(["/favicon.ico", "/logo-begina-mark.png"]);

/** Stránky e-shopu bez parametru — na begina.cz stejná cesta bez /eshop. */
const ESHOP_PAGES = new Set([
  "/kosik",
  "/pokladna",
  "/doprava",
  "/o-nas",
  "/o-vode",
  "/obchodni-podminky",
  "/ochrana-osobnich-udaju",
]);

/** Soubory pro vyhledávače — na begina.cz je obslouží app/eshop/{robots.txt,sitemap.xml}. */
const SEO_FILES = new Set(["/robots.txt", "/sitemap.xml"]);

// Staré adresy z WordPressu/WooCommerce (begina.cz) → 301. Produkty
// WooCommerce mají tvar /produkt/<slug>/ — stejný jako nový e-shop; tady
// jen slugy, které se liší (doplní se z exportu WordPressu).
export const LEGACY_PRODUCT_SLUGS: Readonly<Record<string, string>> = {};
/**
 * /kategorie-produktu/<slug>/ → /kategorie/<slug>. Slugy sirupy, caje,
 * polevky, ovocne-napoje jsou stejné; liší se jen koktejly (audit sitemapy
 * WordPressu 10. 10. 2026, scripts/begina-cutover/wp-audit.mts).
 */
export const LEGACY_CATEGORY_SLUGS: Readonly<Record<string, string>> = {
  "alkoholicke-koktejly": "koktejly",
};
/** Stránky WordPressu (audit sitemapy 10. 10. 2026) → nejbližší stránka nového webu. */
const LEGACY_PAGES: Readonly<Record<string, string>> = {
  "/gdpr": "/ochrana-osobnich-udaju",
  "/obchod": "/",
  "/shop": "/",
  "/muj-ucet": "/",
  "/eshop": "/",
  // přehledy produktů → úvod e-shopu (pruh kategorií)
  "/obchod-s-beginami": "/",
  "/beginy": "/",
  "/napoje": "/",
  "/kategorie": "/",
  "/alkoholicke-koktejly": "/kategorie/koktejly",
  // kontakt je v patičce každé stránky a na O nás
  "/kontakty": "/o-nas",
  // prázdné nebo zatím nepřenesené stránky → úvod (rozhodnutí o obsahu: ESHOP_DOMENY.md)
  "/landing-page": "/",
  "/partnersky-program": "/",
  "/pro-podniky-gastro": "/",
  "/begina-english": "/",
  "/begina-deutsch": "/",
};
/** Archivy vlastnosti „balení“ WooCommerce (/baleni/3-l-rodinna-zasoba/) → úvod. */
const LEGACY_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["/baleni/", "/"],
  ["/muj-ucet/", "/"],
];
/**
 * Části WordPressu, které už nikdy nebudou — 410 (vyhledávač je rychle
 * zapomene): administrace a API, ukázkový obsah instalace (Ahoj všichni,
 * Zkušební stránka), testovací stránka, archivy autorů a rubrik.
 */
const WORDPRESS_GONE =
  /^\/(?:wp-admin|wp-login\.php|wp-json|wp-includes|wp-cron\.php|xmlrpc\.php|feed|comments\/feed|ahoj-vsichni|zkusebni-stranka|uvod-jarek|author|category)(?:\/.*)?$/;

/** Dnešní dočasná přesměrování na moje.begina.cz (dřív v next.config.ts) — beze změny. */
const INTERNAL_LEGACY_PAGES: Readonly<Record<string, string>> = {
  "/gdpr": "/ochrana-osobnich-udaju",
  "/obchodni-podminky": "/obchodni-podminky",
  "/doprava": "/doprava",
};

const isGetLike = (method: string) => method === "GET" || method === "HEAD";

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.replace(/\/+$/, "") || "/" : pathname;
}

/** /eshop/x → /x, /eshop → / (jen pro cesty, které nejsou statický soubor). */
function withoutEshopPrefix(pathname: string): string | null {
  if (pathname === ESHOP_PREFIX || pathname === `${ESHOP_PREFIX}/`) return "/";
  if (pathname.startsWith(`${ESHOP_PREFIX}/`)) return pathname.slice(ESHOP_PREFIX.length);
  return null;
}

/** Cesta e-shopu na begina.cz → interní cesta v app/eshop; null = není to stránka e-shopu. */
export function publicEshopPath(pathname: string): string | null {
  if (pathname === "/") return ESHOP_PREFIX;
  if (ESHOP_PAGES.has(pathname) || SEO_FILES.has(pathname)) return `${ESHOP_PREFIX}${pathname}`;
  const [, section, param, ...rest] = pathname.split("/");
  if (rest.length > 0 || param === undefined) return null;
  if ((section === "produkt" || section === "kategorie") && SLUG.test(param)) return `${ESHOP_PREFIX}/${section}/${param}`;
  if (section === "objednavka" && UUID.test(param)) return `${ESHOP_PREFIX}/objednavka/${param}`;
  return null;
}

function routePublic(pathname: string, search: string, method: string): RouteDecision {
  if (pathname.startsWith("/_next/") || ROOT_ASSETS.has(pathname) || ESHOP_ASSET.test(pathname)) {
    return { kind: "pass", site: "public" };
  }
  if (isGetLike(method) && pathname !== "/" && pathname.endsWith("/")) {
    return { kind: "redirect", location: `${PUBLIC_ORIGIN}${stripTrailingSlash(pathname)}${search}`, status: 301 };
  }

  const eshopPath = publicEshopPath(pathname);
  if (eshopPath) {
    const slug = pathname.startsWith("/produkt/") ? pathname.slice("/produkt/".length) : null;
    const renamed = slug !== null ? LEGACY_PRODUCT_SLUGS[slug] : undefined;
    if (renamed && isGetLike(method)) {
      return { kind: "redirect", location: `${PUBLIC_ORIGIN}/produkt/${renamed}`, status: 301 };
    }
    return { kind: "rewrite", path: eshopPath };
  }

  if (!isGetLike(method)) return { kind: "notFound" };

  if (WORDPRESS_GONE.test(pathname)) return { kind: "gone" };
  const legacyPage = LEGACY_PAGES[pathname];
  if (legacyPage) return { kind: "redirect", location: `${PUBLIC_ORIGIN}${legacyPage}`, status: 301 };
  const category = /^\/kategorie-produktu\/([a-z0-9-]+)(?:\/.*)?$/.exec(pathname);
  if (category && SLUG.test(category[1])) {
    const slug = LEGACY_CATEGORY_SLUGS[category[1]] ?? category[1];
    return { kind: "redirect", location: `${PUBLIC_ORIGIN}/kategorie/${slug}`, status: 301 };
  }
  const prefix = LEGACY_PREFIXES.find(([from]) => pathname.startsWith(from));
  if (prefix) return { kind: "redirect", location: `${PUBLIC_ORIGIN}${prefix[1]}`, status: 301 };
  // Stará adresa s prefixem /eshop (odkaz z moje.begina.cz) → kanonická bez něj.
  const stripped = withoutEshopPrefix(pathname);
  if (stripped !== null && publicEshopPath(stripped)) {
    return { kind: "redirect", location: `${PUBLIC_ORIGIN}${stripped}${search}`, status: 301 };
  }
  return { kind: "notFound" };
}

function routeInternal(pathname: string, search: string, method: string, env: Env): RouteDecision {
  const canonical = canonicalRedirectEnabled(env);
  const legacy = INTERNAL_LEGACY_PAGES[stripTrailingSlash(pathname)];
  if (legacy && isGetLike(method)) {
    return canonical
      ? { kind: "redirect", location: `${PUBLIC_ORIGIN}${legacy}`, status: 301 }
      : { kind: "redirect", location: `${ESHOP_PREFIX}${legacy}`, status: 307 };
  }
  // Po přepnutí domény: stránky e-shopu na moje.begina.cz → begina.cz.
  // Jen GET/HEAD (rozpracované odeslání pokladny doběhne), ne statické
  // soubory (fotky v MojeBegina), a jen na pevnou adresu PUBLIC_ORIGIN.
  if (canonical && isGetLike(method) && !ESHOP_ASSET.test(pathname)) {
    const stripped = withoutEshopPrefix(pathname);
    if (stripped !== null) {
      return { kind: "redirect", location: `${PUBLIC_ORIGIN}${stripped}${search}`, status: 301 };
    }
  }
  return { kind: "pass", site: "internal" };
}

const GET_HEAD = ["GET", "HEAD"] as const;

/**
 * Pilotní doména asistenta: PŘESNÉ cesty (bez lomítka na konci, bez další
 * části, bez jiné velikosti písmen či zakódovaných znaků — pathname se
 * porovnává tak, jak přišel) a povolené metody. Nic dalšího.
 *
 * Neon Auth: přihlašovací formulář volá z prohlížeče jen
 * POST /api/auth/sign-in/email; ověření session na serveru
 * (auth.getSession) jde přímo na Neon Auth, ne přes /api/auth. Reset
 * hesla, registrace, odhlášení ani nic dalšího pod /api/auth tu není.
 */
export const AGENT_ROUTES: Readonly<Record<string, readonly string[]>> = {
  "/.well-known/oauth-authorization-server": GET_HEAD,
  "/.well-known/oauth-protected-resource": GET_HEAD,
  "/.well-known/oauth-protected-resource/api/mcp": GET_HEAD,
  // GET a DELETE odpoví route 405 (bezstavový server) — klient MCP je zkouší.
  "/api/mcp": ["POST", "GET", "DELETE"],
  "/api/oauth/token": ["POST"],
  "/api/oauth/revoke": ["POST"],
  // POST = serverová akce souhlasu (Povolit / Zamítnout)
  "/oauth/authorize": [...GET_HEAD, "POST"],
  "/login": GET_HEAD,
  "/api/auth/sign-in/email": ["POST"],
  "/favicon.ico": GET_HEAD,
  "/robots.txt": GET_HEAD,
};

function routeAgent(pathname: string, method: string): RouteDecision {
  const methods = Object.hasOwn(AGENT_ROUTES, pathname) ? AGENT_ROUTES[pathname] : undefined;
  return methods?.includes(method) ? { kind: "pass", site: "internal" } : { kind: "deny" };
}

export function route(input: RouteInput, env: Env = process.env): RouteDecision {
  const method = input.method.toUpperCase();
  // Pilotní doména má přednost: Host NEBO kterákoli hodnota X-Forwarded-Host.
  if (isAgentRequest(input.host, input.forwardedHost)) return routeAgent(input.pathname, method);
  const site: Site = siteForHost(input.host);
  if (site === "www") {
    return { kind: "redirect", location: `${PUBLIC_ORIGIN}${input.pathname}${input.search}`, status: isGetLike(method) ? 301 : 308 };
  }
  if (site === "public") return routePublic(input.pathname, input.search, method);
  return routeInternal(input.pathname, input.search, method, env);
}

// Audit současného webu begina.cz (WordPress/WooCommerce) před přepnutím
// domény — čisté funkce (testy: lib/site/__tests__/wpAudit.test.ts).
// Síťovou část dělá scripts/begina-cutover/wp-audit.ts (jen GET/HEAD).
import { route, type RouteDecision } from "./routing";

/** <loc> z sitemapy (index i urlset), bez duplicit, v pořadí. */
export function parseSitemapLocs(xml: string): { sitemaps: string[]; urls: string[] } {
  const locs = (block: string) =>
    [...xml.matchAll(new RegExp(`<${block}>[\\s\\S]*?<loc>\\s*([^<]+?)\\s*</loc>[\\s\\S]*?</${block}>`, "g"))].map((m) =>
      m[1].replace(/&amp;/g, "&")
    );
  return { sitemaps: [...new Set(locs("sitemap"))], urls: [...new Set(locs("url"))] };
}

/** Řádky „Sitemap: …“ z robots.txt. */
export function sitemapsFromRobots(robots: string): string[] {
  return [...robots.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)].map((m) => m[1]);
}

export type UrlVerdict =
  | { kind: "same"; path: string } // stejná adresa existuje v novém e-shopu
  | { kind: "redirect"; path: string; target: string } // 301/308 na existující stránku
  | { kind: "gone"; path: string } // 410 (WordPress)
  | { kind: "missing"; path: string; reason: string }; // 404 — potřebuje mapování

/** Slugy v katalogu nového e-shopu (z DB) — bez nich se existence produktu/kategorie neověřuje. */
export type KnownSlugs = { products: ReadonlySet<string>; categories: ReadonlySet<string> };

/** Cílová stránka produktu/kategorie, která v katalogu není → v provozu 404. */
function missingInCatalog(path: string, known?: KnownSlugs): string | null {
  if (!known) return null;
  const m = /^\/(produkt|kategorie)\/([a-z0-9-]+)$/.exec(path);
  if (!m) return null;
  const set = m[1] === "produkt" ? known.products : known.categories;
  return set.has(m[2]) ? null : `${path} není v katalogu`;
}

/** Projde rozhodnutí proxy (včetně řetězce přesměrování) pro starou adresu na begina.cz. */
export function verdictFor(url: string, known?: KnownSlugs): UrlVerdict {
  let path = new URL(url).pathname;
  const original = path;
  for (let hop = 0; hop < 5; hop++) {
    const decision: RouteDecision = route({ host: "begina.cz", pathname: path, search: "", method: "GET" }, {});
    if (decision.kind === "rewrite" || decision.kind === "pass") {
      const missing = missingInCatalog(path, known);
      if (missing) return { kind: "missing", path: original, reason: missing };
      return hop === 0 ? { kind: "same", path: original } : { kind: "redirect", path: original, target: path };
    }
    if (decision.kind === "gone") return { kind: "gone", path: original };
    if (decision.kind === "notFound" || decision.kind === "deny") return { kind: "missing", path: original, reason: hop === 0 ? "404" : `→ ${path} = 404` };
    const next = new URL(decision.location, "https://begina.cz");
    if (next.host !== "begina.cz") return { kind: "missing", path: original, reason: `→ jiná doména ${next.host}` };
    path = next.pathname;
  }
  return { kind: "missing", path: original, reason: "smyčka přesměrování" };
}

/** Produkt, který existuje na novém e-shopu (stejný slug), ale chybí v jeho katalogu → 404 až v provozu. */
export function productSlug(path: string): string | null {
  return /^\/produkt\/([a-z0-9-]+)\/?$/.exec(path)?.[1] ?? null;
}

/** Doplňky WordPressu podle cest /wp-content/plugins/<název>/ v HTML. */
export function pluginsFromHtml(html: string): string[] {
  return [...new Set([...html.matchAll(/\/wp-content\/plugins\/([a-z0-9_-]+)\//gi)].map((m) => m[1].toLowerCase()))].sort();
}

/** Doplňky, které mění číslo objednávky WooCommerce (jinak číslo = ID záznamu WordPressu). */
export const ORDER_NUMBER_PLUGIN_HINTS = [
  "sequential",
  "order-numbers",
  "order-number",
  "custom-order-numbers",
  "wt-woocommerce-sequential",
  "woocommerce-jetpack", // Booster
];

export function orderNumberPlugins(plugins: string[], namespaces: string[]): string[] {
  const hits = [...plugins, ...namespaces].filter((name) => ORDER_NUMBER_PLUGIN_HINTS.some((hint) => name.toLowerCase().includes(hint)));
  return [...new Set(hits)];
}

/** Rozbor hlavičky HSTS. */
export function parseHsts(value: string | null): { maxAge: number; includeSubDomains: boolean; preload: boolean } | null {
  if (!value) return null;
  const maxAge = Number(/max-age=(\d+)/i.exec(value)?.[1] ?? NaN);
  return {
    maxAge: Number.isFinite(maxAge) ? maxAge : 0,
    includeSubDomains: /includesubdomains/i.test(value),
    preload: /preload/i.test(value),
  };
}

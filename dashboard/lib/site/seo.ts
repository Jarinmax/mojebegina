// robots.txt a sitemap.xml — čisté funkce (testy: lib/site/__tests__/seo.test.ts).
//
// begina.cz: indexace jen s ESHOP_INDEXING=on (lib/site/flags.ts); jinak
//   „Disallow: /“ (stejně jako noindex v hlavičkách a meta).
// moje.begina.cz / Preview: nikdy (app/robots.ts).
import { PUBLIC_ORIGIN } from "./hosts";

/** Stránky, které vyhledávač nemá procházet ani při zapnuté indexaci. */
const PUBLIC_DISALLOW = ["/kosik", "/pokladna", "/objednavka/"];

/** Roboti s vlastní, výslovně povolující skupinou. */
export const PUBLIC_AGENTS = [
  "Googlebot",
  "Google-Extended",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
];

export function publicRobotsTxt(indexing: boolean): string {
  if (!indexing) return "User-agent: *\nDisallow: /\n";
  // Výslovně povolené vyhledávače a AI (Lucie 20. 11. 2026: zákaznice nás našla přes ChatGPT;
  // večer doplněno Google-Extended, PerplexityBot a ClaudeBot). Vlastní skupina pro robota
  // nahrazuje skupinu „*“, proto má každá stejné zákazy košíku a pokladny.
  const group = (agent: string) => [`User-agent: ${agent}`, "Allow: /", ...PUBLIC_DISALLOW.map((path) => `Disallow: ${path}`), ""];
  return [
    ...PUBLIC_AGENTS.flatMap(group),
    ...group("*"),
    `Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}

export const INTERNAL_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** paths = cesty e-shopu bez /eshop („/", „/produkt/kulajda"); vždy na https://begina.cz. */
export function sitemapXml(paths: string[]): string {
  const unique = [...new Set(paths)];
  const urls = unique.map((path) => `  <url><loc>${escapeXml(`${PUBLIC_ORIGIN}${path === "/" ? "/" : path}`)}</loc></url>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>", ""].join("\n");
}

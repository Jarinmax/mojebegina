// Audit současného begina.cz (WordPress/WooCommerce) před přepnutím domény.
// POUZE ČTE (GET/HEAD veřejných adres) — nic nepřihlašuje, nic nezapisuje.
//
//   NODE_USE_ENV_PROXY=1 npx tsx scripts/begina-cutover/wp-audit.mts [katalog.json] > audit.md
//   katalog.json (volitelně) = {"products":[slugy],"categories":[slugy]} z DB —
//   pak audit ověří i to, že cílový produkt/kategorie v novém e-shopu existuje
//   (NODE_USE_ENV_PROXY: fetch v Node jde přes HTTPS_PROXY, je-li nastavená;
//    bez spojení skript skončí kódem 2 a nic nevyhodnotí)
//
// Výstup (Markdown):
//   1) hlavičky http/https, begina.cz i www (HSTS, přesměrování, server),
//   2) všechny URL ze sitemapy WordPressu a co s nimi udělá proxy.ts
//      (stejná adresa / 301 / 410 / CHYBÍ mapování),
//   3) číslování objednávek: doplňky pro čísla objednávek, nejvyšší veřejná
//      ID záznamů WordPressu (dolní mez pro další ID objednávky).
import {
  orderNumberPlugins,
  parseHsts,
  parseSitemapLocs,
  pluginsFromHtml,
  productSlug,
  sitemapsFromRobots,
  verdictFor,
  type KnownSlugs,
  type UrlVerdict,
} from "../../lib/site/wpAudit";
import { readFileSync } from "node:fs";

const ORIGIN = "https://begina.cz";
const MAX_SITEMAPS = 50;
const UA = "BeginaCutoverAudit/1.0 (read-only)";

async function get(url: string, redirect: RequestRedirect = "follow") {
  try {
    const res = await fetch(url, { redirect, headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    return { status: res.status, headers: res.headers, body: redirect === "manual" ? "" : await res.text(), url: res.url };
  } catch (error) {
    return { status: 0, headers: new Headers(), body: "", url, error: String(error) };
  }
}

// Bez spojení nic nevyhodnocovat — prázdný výsledek by vypadal jako „nic nechybí“.
const probe = await get(`${ORIGIN}/robots.txt`);
if (probe.status === 0) {
  console.error(`begina.cz není z tohoto prostředí dostupné (${probe.error ?? "bez odpovědi"}) — audit neproveden.`);
  process.exit(2);
}

const lines: string[] = [];
const out = (line = "") => lines.push(line);

// ---------------------------------------------------------------- 1) hlavičky
out("# Audit begina.cz (WordPress) — " + new Date().toISOString());
out("\n## 1. Hlavičky\n");
out("| Adresa | Stav | Location | HSTS | Server / X-Powered-By |");
out("|---|---|---|---|---|");
for (const url of ["http://begina.cz/", "https://begina.cz/", "http://www.begina.cz/", "https://www.begina.cz/"]) {
  const res = await get(url, "manual");
  const hsts = res.headers.get("strict-transport-security");
  out(
    `| ${url} | ${res.status || "chyba"} | ${res.headers.get("location") ?? ""} | ${hsts ?? "—"} | ${[res.headers.get("server"), res.headers.get("x-powered-by")].filter(Boolean).join(" / ")} |`
  );
  const parsed = parseHsts(hsts);
  if (parsed?.includeSubDomains) out(`\n> ⚠️ ${url}: HSTS s includeSubDomains (max-age ${parsed.maxAge} s) — prohlížeče už vynucují HTTPS i na subdoménách.\n`);
  if (parsed?.preload) out(`\n> ⚠️ ${url}: HSTS preload.\n`);
}

// ---------------------------------------------------------------- 2) URL ze sitemapy
const robots = probe;
const queue = [
  ...sitemapsFromRobots(robots.body),
  `${ORIGIN}/wp-sitemap.xml`,
  `${ORIGIN}/sitemap_index.xml`,
  `${ORIGIN}/sitemap.xml`,
];
const seen = new Set<string>();
const urls = new Set<string>();
while (queue.length && seen.size < MAX_SITEMAPS) {
  const sitemap = queue.shift()!;
  if (seen.has(sitemap)) continue;
  seen.add(sitemap);
  const res = await get(sitemap);
  if (res.status !== 200 || !res.body.includes("<loc>")) continue;
  const { sitemaps, urls: found } = parseSitemapLocs(res.body);
  queue.push(...sitemaps.filter((s) => !seen.has(s)));
  for (const u of found) if (/^https?:\/\/(www\.)?begina\.cz\//.test(u)) urls.add(u);
}

out(`\n## 2. URL ze sitemapy (${urls.size} adres, ${seen.size} sitemap)\n`);
const catalogFile = process.argv[2];
const known: KnownSlugs | undefined = catalogFile
  ? (() => {
      const raw = JSON.parse(readFileSync(catalogFile, "utf8")) as { products: string[]; categories: string[] };
      return { products: new Set(raw.products), categories: new Set(raw.categories) };
    })()
  : undefined;
out(known ? `(ověřeno proti katalogu: ${known.products.size} produktů, ${known.categories.size} kategorií)\n` : "(bez katalogu — existence produktů a kategorií se neověřuje)\n");
const verdicts: UrlVerdict[] = [...urls].sort().map((u) => verdictFor(u, known));
const by = (kind: UrlVerdict["kind"]) => verdicts.filter((v) => v.kind === kind);
out(`- stejná adresa v novém e-shopu: **${by("same").length}**`);
out(`- 301 na stránku e-shopu: **${by("redirect").length}**`);
out(`- 410 (WordPress): **${by("gone").length}**`);
out(`- **CHYBÍ mapování (dnes by byly 404): ${by("missing").length}**\n`);
out("| Stará adresa | Výsledek |");
out("|---|---|");
for (const v of verdicts) {
  const result =
    v.kind === "same" ? "stejná" : v.kind === "redirect" ? `301 → ${v.target}` : v.kind === "gone" ? "410" : `**CHYBÍ** (${v.reason})`;
  out(`| ${v.path} | ${result} |`);
}
const productSlugs = verdicts.map((v) => productSlug(v.path)).filter((s): s is string => s !== null);
out(`\nSlugy produktů ve WooCommerce (porovnat s katalogem e-shopu): ${productSlugs.join(", ") || "—"}`);

// ---------------------------------------------------------------- 3) číslování objednávek
out("\n## 3. Číslování objednávek WooCommerce\n");
const home = await get(`${ORIGIN}/`);
const plugins = pluginsFromHtml(home.body);
const api = await get(`${ORIGIN}/wp-json/`);
let namespaces: string[] = [];
try {
  namespaces = (JSON.parse(api.body) as { namespaces?: string[] }).namespaces ?? [];
} catch {
  namespaces = [];
}
out(`- doplňky viditelné na úvodní stránce: ${plugins.join(", ") || "—"}`);
out(`- REST API (/wp-json/): ${api.status}; jmenné prostory: ${namespaces.join(", ") || "—"}`);
const numbering = orderNumberPlugins(plugins, namespaces);
out(
  numbering.length
    ? `- **doplněk pro čísla objednávek: ${numbering.join(", ")}** → číslo objednávky ≠ ID záznamu`
    : "- doplněk pro čísla objednávek **nenalezen** (veřejně) → pravděpodobně výchozí WooCommerce: číslo objednávky = ID záznamu WordPressu (není souvislé)"
);

out("\nNejvyšší veřejná ID záznamů WordPressu (dolní mez pro ID příští objednávky):\n");
out("| Typ | Nejvyšší ID | Datum |");
out("|---|---|---|");
let maxId = 0;
for (const type of ["posts", "pages", "media", "product"]) {
  const res = await get(`${ORIGIN}/wp-json/wp/v2/${type}?per_page=1&orderby=id&order=desc&_fields=id,date&status=publish`);
  try {
    const [row] = JSON.parse(res.body) as { id: number; date: string }[];
    if (row?.id) {
      maxId = Math.max(maxId, row.id);
      out(`| ${type} | ${row.id} | ${row.date} |`);
      continue;
    }
  } catch {
    /* neveřejné / jiný formát */
  }
  out(`| ${type} | — (${res.status}) | |`);
}
out(`\n**Nejvyšší veřejné ID: ${maxId || "—"}** (revize a koncepty nejsou veřejné — skutečné další ID může být vyšší).`);

console.log(lines.join("\n"));

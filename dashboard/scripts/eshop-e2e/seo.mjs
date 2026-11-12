// ESHOP — vyhledávače (12. 11. 2026): vlastní <title> a meta description na
// úvodu, kategoriích a produktech; JSON-LD Product (nabídka za každé balení
// v CZK), BreadcrumbList, Organization; alt u fotek. BASE=https://begina.cz pro ostrý web.
const PORT = Number(process.argv[2] ?? 3100);
// lokálně: begina.cz → 127.0.0.1 v /etc/hosts (CI to nastaví)
const BASE = process.env.BASE ?? `http://begina.cz:${PORT}`;
const fails = [];
const ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const page = async (u) => {
  const r = await fetch(BASE + u, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } });
  const h = await r.text();
  const m = (re) => (h.match(re) || [, ""])[1].replace(/\s+/g, " ").trim();
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((x) => [].concat(JSON.parse(x[1])));
  const metaDesc = [...h.matchAll(/<meta name="description" content="([^"]*)"/g)].map((x) => x[1]);
  return { status: r.status, title: m(/<title>([\s\S]*?)<\/title>/), desc: metaDesc, ld, h };
};
const descs = new Map();
const home = await page("/");
check("úvod: název se slovy", /bylinné sirupy, polévky/.test(home.title), home.title);
check("úvod: jeden popis", home.desc.length === 1 && /Bylinné sirupy, polévky/.test(home.desc[0]), home.desc.join(" | "));
check("úvod: Organization a WebSite", home.ld.some((o) => o["@type"] === "Organization") && home.ld.some((o) => o["@type"] === "WebSite"));
descs.set("/", home.desc[0]);
for (const slug of ["polevky", "sirupy", "caje"]) {
  const p = await page(`/kategorie/${slug}`);
  check(`kategorie ${slug}: jeden vlastní popis`, p.desc.length === 1 && !/Objevte naši nabídku/.test(p.desc[0]) && p.desc[0].length <= 160, p.desc.join(" | "));
  check(`kategorie ${slug}: drobečky`, p.ld.some((o) => o["@type"] === "BreadcrumbList"));
  descs.set(slug, p.desc[0]);
}
check("kategorie sirupy: názvy produktů v popisu", /Lipový sirup/.test(descs.get("sirupy") ?? ""), descs.get("sirupy"));
for (const slug of ["lipovy-sirup", "dynova-polevka", "bylinny-sirup-saman"]) {
  const p = await page(`/produkt/${slug}`);
  const prod = p.ld.find((o) => o["@type"] === "Product");
  check(`${slug}: název s kategorií`, / – .+ \| Begina$/.test(p.title), p.title);
  check(`${slug}: popis z textu produktu`, p.desc.length === 1 && !/^3 l:|^Až 12 porcí/.test(p.desc[0]) && p.desc[0].length <= 160, p.desc.join(" | "));
  check(`${slug}: Product s nabídkami v CZK`, prod && prod.offers.length >= 1 && prod.offers.every((o) => o.priceCurrency === "CZK" && Number(o.price) > 0 && /schema.org\/(InStock|OutOfStock)/.test(o.availability)), JSON.stringify(prod?.offers));
  check(`${slug}: fotky absolutně`, prod && prod.image?.every((u) => u.startsWith("https://")));
  check(`${slug}: bez hodnocení`, !/aggregateRating|"review"/.test(JSON.stringify(p.ld)));
  descs.set(slug, p.desc[0]);
}
check("popisy se neopakují", new Set(descs.values()).size === descs.size);
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) { console.log(fails.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

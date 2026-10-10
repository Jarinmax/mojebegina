// ESHOP — ověření rozlišení domén v prohlížeči nad sestavenou aplikací
// (next start + testovací DB neon-http-pglite.mjs). Nikdy se nepřipojuje
// k Neonu ani k produkční doméně: Chromium dostane begina.cz,
// www.begina.cz a moje.begina.cz namířené na 127.0.0.1.
//
// Spuštění (po `next build`):
//   PORT=3100 DATABASE_URL=postgresql://u:p@ep-test.neon.tech/neondb \
//   NODE_OPTIONS="--import ./scripts/eshop-e2e/neon-http-pglite.mjs" npx next start -p 3100 &
//   node scripts/eshop-e2e/domeny.mjs 3100 [vychozi|presmerovani|indexace]
//   (Playwright není závislost projektu — případně PLAYWRIGHT_MODULE=<cesta k
//    playwright/index.mjs>, např. $(npm root -g)/playwright/index.mjs)
//
// Režimy odpovídají přepínačům, se kterými běží server:
//   vychozi       — žádný přepínač (stav po sloučení PR)
//   presmerovani  — ESHOP_CANONICAL_ORIGIN=https://begina.cz
//   indexace      — ESHOP_INDEXING=on
import http from "node:http";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const MODE = process.argv[3] ?? "vychozi";
const ORDER_ID_RE = /\/objednavka\/([0-9a-f-]{36})/;
const failures = [];
const passed = [];

function check(name, ok, detail = "") {
  (ok ? passed : failures).push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Požadavek s danou hlavičkou Host přímo na lokální server (bez následování přesměrování). */
function raw(host, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path, method, headers: { host: `${host}:${PORT}`, ...headers } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const browser = await chromium.launch({
  args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1, MAP www.begina.cz 127.0.0.1, MAP moje.begina.cz 127.0.0.1`],
});
const pub = (path) => `http://begina.cz:${PORT}${path}`;
const internal = (path) => `http://moje.begina.cz:${PORT}${path}`;

try {
  // ---------------------------------------------------------------- hlavičky
  const home = await raw("begina.cz", "/");
  check("begina.cz / → 200", home.status === 200, String(home.status));
  check("begina.cz HSTS 1 týden bez subdomén", home.headers["strict-transport-security"] === "max-age=604800", home.headers["strict-transport-security"]);
  const mojeLogin = await raw("moje.begina.cz", "/login");
  check("moje.begina.cz /login → 200", mojeLogin.status === 200, String(mojeLogin.status));
  check(
    "moje.begina.cz HSTS beze změny",
    mojeLogin.headers["strict-transport-security"] === "max-age=63072000; includeSubDomains",
    mojeLogin.headers["strict-transport-security"]
  );
  check("moje.begina.cz vždy noindex", mojeLogin.headers["x-robots-tag"] === "noindex, nofollow", mojeLogin.headers["x-robots-tag"]);
  if (MODE === "indexace") {
    check("begina.cz s ESHOP_INDEXING: bez X-Robots-Tag", home.headers["x-robots-tag"] === undefined, home.headers["x-robots-tag"]);
    check("begina.cz s ESHOP_INDEXING: meta robots index", /<meta name="robots" content="index, follow"/.test(home.body));
  } else {
    check("begina.cz noindex (výchozí)", home.headers["x-robots-tag"] === "noindex, nofollow", home.headers["x-robots-tag"]);
    check("begina.cz meta robots noindex (výchozí)", /<meta name="robots" content="noindex, nofollow"/.test(home.body));
  }
  check("kanonická adresa https://begina.cz/", /<link rel="canonical" href="https:\/\/begina\.cz\/?"/.test(home.body));

  // ---------------------------------------------------------------- MojeBegina na begina.cz = 404
  for (const path of ["/login", "/admin", "/rizeni-firmy", "/rizeni-firmy/objednavky", "/objednavky", "/profil", "/api/auth/get-session"]) {
    const res = await raw("begina.cz", path);
    check(`begina.cz GET ${path} → 404`, res.status === 404, String(res.status));
    check(`begina.cz ${path} neprozradí MojeBegina`, !/Přihlásit|Moje Begina|Řízení firmy/i.test(res.body.replace(/<script[\s\S]*?<\/script>/g, "")));
  }
  for (const path of ["/api/eshop/stripe/webhook", "/api/auth/sign-in/email", "/login"]) {
    const res = await raw("begina.cz", path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    check(`begina.cz POST ${path} → 404`, res.status === 404, String(res.status));
  }
  // Serverová akce MojeBegina podstrčená na stránku e-shopu (Next-Action s cizím id)
  const forged = await raw("begina.cz", "/pokladna", {
    method: "POST",
    headers: { "next-action": "0".repeat(42), "content-type": "text/plain;charset=UTF-8" },
    body: "[]",
  });
  check("begina.cz podvržená serverová akce neprojde (4xx)", forged.status >= 400 && forged.status < 500, String(forged.status));

  // ---------------------------------------------------------------- přesměrování
  const www = await raw("www.begina.cz", "/o-nas?x=1");
  check("www → 301 https://begina.cz/o-nas?x=1", www.status === 301 && www.headers.location === "https://begina.cz/o-nas?x=1", `${www.status} ${www.headers.location}`);
  const gdpr = await raw("begina.cz", "/gdpr");
  check("begina.cz /gdpr → 301", gdpr.status === 301 && gdpr.headers.location === "https://begina.cz/ochrana-osobnich-udaju", `${gdpr.status} ${gdpr.headers.location}`);
  const wp = await raw("begina.cz", "/wp-login.php");
  check("begina.cz /wp-login.php → 410", wp.status === 410, String(wp.status));
  const legacyCat = await raw("begina.cz", "/kategorie-produktu/sirupy/");
  check("begina.cz /kategorie-produktu/sirupy/ → 30x na /kategorie/sirupy", [301, 308].includes(legacyCat.status) && /\/kategorie(-produktu)?\/sirupy/.test(legacyCat.headers.location ?? ""), `${legacyCat.status} ${legacyCat.headers.location}`);
  const mojeGdpr = await raw("moje.begina.cz", "/gdpr");
  if (MODE === "presmerovani") {
    check("moje /gdpr → 301 begina.cz", mojeGdpr.status === 301 && mojeGdpr.headers.location === "https://begina.cz/ochrana-osobnich-udaju", `${mojeGdpr.status} ${mojeGdpr.headers.location}`);
  } else {
    check("moje /gdpr → 307 /eshop/… (jako dosud)", mojeGdpr.status === 307 && mojeGdpr.headers.location === "/eshop/ochrana-osobnich-udaju", `${mojeGdpr.status} ${mojeGdpr.headers.location}`);
  }

  // ---------------------------------------------------------------- robots + sitemap
  const robotsPub = await raw("begina.cz", "/robots.txt");
  const robotsMoje = await raw("moje.begina.cz", "/robots.txt");
  check("moje.begina.cz robots.txt zakazuje vše", robotsMoje.status === 200 && /Disallow: \/\s*$/m.test(robotsMoje.body), robotsMoje.body.trim());
  if (MODE === "indexace") {
    check("begina.cz robots.txt povoluje + sitemap", /Allow: \//.test(robotsPub.body) && /Sitemap: https:\/\/begina\.cz\/sitemap\.xml/.test(robotsPub.body), robotsPub.body.trim());
  } else {
    check("begina.cz robots.txt zakazuje vše (výchozí)", robotsPub.status === 200 && robotsPub.body.trim() === "User-agent: *\nDisallow: /", robotsPub.body.trim());
  }
  const sitemap = await raw("begina.cz", "/sitemap.xml");
  check("begina.cz sitemap.xml s produkty na https://begina.cz", sitemap.status === 200 && sitemap.body.includes("<loc>https://begina.cz/produkt/kulajda</loc>") && !sitemap.body.includes("/eshop"), String(sitemap.status));
  const sitemapMoje = await raw("moje.begina.cz", "/eshop/sitemap.xml");
  check("moje.begina.cz /eshop/sitemap.xml neexistuje (nebo → begina.cz)", [404, 301].includes(sitemapMoje.status), String(sitemapMoje.status));

  // ---------------------------------------------------------------- prohlížeč: nákup na begina.cz
  const page = await browser.newPage();
  const badHrefs = [];
  await page.goto(pub("/"));
  check("úvod begina.cz: adresa bez /eshop", new URL(page.url()).pathname === "/", page.url());
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  for (const href of hrefs) if (/^\/eshop(\/|$)/.test(href)) badHrefs.push(href);
  check("úvod begina.cz: žádný odkaz na /eshop/…", badHrefs.length === 0, badHrefs.join(", "));

  await page.click('nav[aria-label="Hlavní menu"] >> text=Polévky');
  await page.waitForURL(/\/kategorie\/polevky$/);
  check("klientská navigace → begina.cz/kategorie/polevky", page.url() === pub("/kategorie/polevky"), page.url());
  await page.click('a[href="/produkt/kulajda"] >> nth=0');
  await page.waitForURL(/\/produkt\/kulajda$/);
  check("klientská navigace → begina.cz/produkt/kulajda", page.url() === pub("/produkt/kulajda"), page.url());
  const imageOk = await page.$$eval("img", (imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length);
  check("obrázky se na begina.cz načtou", imageOk > 0, `${imageOk} obrázků`);
  const productHtml = await raw("begina.cz", "/produkt/kulajda");
  check("produkt: kanonická adresa https://begina.cz/produkt/kulajda", /<link rel="canonical" href="https:\/\/begina\.cz\/produkt\/kulajda"/.test(productHtml.body));

  await page.click('button:has-text("Do košíku")');
  await page.click('a:has-text("Zobrazit košík")');
  await page.waitForURL(/\/kosik$/);
  check("košík na begina.cz/kosik", page.url() === pub("/kosik"), page.url());
  await page.click('a:has-text("Pokračovat k objednávce")');
  await page.waitForURL(/\/pokladna$/);
  check("pokladna na begina.cz/pokladna", page.url() === pub("/pokladna"), page.url());
  const termsHref = await page.getAttribute('a:has-text("obchodními podmínkami")', "href");
  check("pokladna: odkaz na VOP bez /eshop", termsHref === "/obchodni-podminky", termsHref);
  await page.fill("#name", "Jana Testovací");
  await page.fill("#email", "jana@example.cz");
  await page.fill("#phone", "+420 777 123 456");
  await page.check('input[name="shippingMethodId"][value="osobni-odber"]');
  await page.check('input[name="termsAccepted"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector('a:has-text("Platební údaje a QR kód"), a:has-text("Zpět do e-shopu")', { timeout: 30000 });
  check("odeslání pokladny (serverová akce přes begina.cz) uložilo objednávku", await page.isVisible('a:has-text("Platební údaje a QR kód")'));
  await page.click('a:has-text("Platební údaje a QR kód")');
  await page.waitForURL(ORDER_ID_RE);
  const orderUrl = new URL(page.url());
  const orderId = ORDER_ID_RE.exec(orderUrl.pathname)?.[1];
  check("stránka objednávky na begina.cz/objednavka/<id>", orderUrl.host === `begina.cz:${PORT}` && orderUrl.pathname === `/objednavka/${orderId}`, page.url());
  const orderRes = await raw("begina.cz", `/objednavka/${orderId}`);
  check("stránka objednávky: Referrer-Policy no-referrer", orderRes.headers["referrer-policy"] === "no-referrer", orderRes.headers["referrer-policy"]);
  check("stránka objednávky: bez cache", /no-store/.test(orderRes.headers["cache-control"] ?? ""), orderRes.headers["cache-control"]);
  check("stránka objednávky: neukazuje jméno, e-mail ani telefon", !/Jana Testovací|jana@example\.cz|777 123 456/.test(orderRes.body));

  // ---------------------------------------------------------------- stará adresa objednávky na moje.begina.cz
  const oldOrder = await raw("moje.begina.cz", `/eshop/objednavka/${orderId}?platba=ok`);
  if (MODE === "presmerovani") {
    check(
      "moje /eshop/objednavka/<id>?platba=ok → 301 begina.cz se stejným id a parametry",
      oldOrder.status === 301 && oldOrder.headers.location === `https://begina.cz/objednavka/${orderId}?platba=ok`,
      `${oldOrder.status} ${oldOrder.headers.location}`
    );
    check("přesměrování nenese data objednávky", !/Kulajda|379/.test(oldOrder.body), oldOrder.body.slice(0, 80));
    const unknownOrder = await raw("moje.begina.cz", "/eshop/objednavka/00000000-0000-4000-8000-000000000000");
    const unknownTarget = await raw("begina.cz", "/objednavka/00000000-0000-4000-8000-000000000000");
    check("neexistující id: přesměrování nic neprozradí, cíl je 404", unknownOrder.status === 301 && unknownTarget.status === 404, `${unknownOrder.status}/${unknownTarget.status}`);
  } else {
    check("moje /eshop/objednavka/<id> funguje beze změny (200)", oldOrder.status === 200, String(oldOrder.status));
  }

  // ---------------------------------------------------------------- moje.begina.cz: e-shop i MojeBegina jako dosud
  if (MODE !== "presmerovani") {
    await page.goto(internal("/eshop/produkt/kulajda"));
    const internalHrefs = await page.$$eval("header a[href]", (as) => as.map((a) => a.getAttribute("href")));
    check("moje.begina.cz/eshop: odkazy dál s /eshop", internalHrefs.includes("/eshop") && internalHrefs.some((h) => h === "/eshop/kosik"), internalHrefs.join(", "));
  }
  await page.goto(internal("/login"));
  check("moje.begina.cz/login se otevře (MojeBegina beze změny)", new URL(page.url()).pathname === "/login" && (await page.locator("form").count()) > 0, page.url());
  const authApi = await raw("moje.begina.cz", "/api/auth/get-session");
  check("moje.begina.cz /api/auth dál dosažitelné (ne 404 z proxy)", authApi.status !== 404, String(authApi.status));
  const webhook = await raw("moje.begina.cz", "/api/eshop/stripe/webhook", { method: "POST", body: "{}" });
  // Bez nastaveného Stripe vrací 404 „Not found“ sama trasa webhooku (pojistka v route.ts),
  // s ním 400 (neplatný podpis) — 404 z proxy by byla e-shopová HTML stránka.
  check(
    "moje.begina.cz Stripe webhook dosáhne na svou trasu (ne 404 z proxy)",
    webhook.status === 400 || (webhook.status === 404 && webhook.body === "Not found"),
    `${webhook.status} ${webhook.body.slice(0, 40)}`
  );
} finally {
  await browser.close();
}

console.log(`\nRežim: ${MODE}\n✔ ${passed.length} kontrol prošlo`);
for (const line of passed) console.log(`  ✔ ${line}`);
if (failures.length) {
  console.log(`✘ ${failures.length} selhalo`);
  for (const line of failures) console.log(`  ✘ ${line}`);
  process.exit(1);
}

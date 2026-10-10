// ESHOP — Meta Pixel + CookieYes a staré adresy produktů v prohlížeči nad
// sestavenou aplikací (next start + testovací DB neon-http-pglite.mjs).
// Nic neodchází ven: skript CookieYes a fbevents.js Meta nahradí lokální
// napodobeniny (page.route), každý požadavek na Facebook se počítá.
//
// Spuštění (po `next build`):
//   PORT=3101 DATABASE_URL=postgresql://u:p@ep-test.neon.tech/neondb \
//   E2E_ORDER_NUMBERING=vs \
//   E2E_CATALOG_SQL=31_sirupy.sql,41_polevky.sql,51_caje.sql,61_zmrzliny.sql,71_ovocne_napoje.sql \
//   ESHOP_MARKETING=on ESHOP_COOKIEYES_ID=5f3760f1f9ac1d11074e41aade2c6467 ESHOP_META_PIXEL_ID=2509610956071494 \
//   NODE_OPTIONS="--import ./scripts/eshop-e2e/neon-http-pglite.mjs" npx next start -p 3101 &
//   node scripts/eshop-e2e/marketing.mjs 3101 [zapnuto|vypnuto]
//   (vypnuto = server bez ESHOP_MARKETING; PLAYWRIGHT_MODULE jako u domeny.mjs)
import http from "node:http";
import { readFileSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3101);
const MODE = process.argv[3] ?? "zapnuto";
const failures = [];
const passed = [];
const check = (name, ok, detail = "") => (ok ? passed : failures).push(`${name}${detail ? ` — ${detail}` : ""}`);

function raw(host, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, path, headers: { host: `${host}:${PORT}` } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end();
  });
}

// Napodobenina CookieYes: souhlas v cookie jako skutečná lišta + událost.
const FAKE_CKY = `
  window.getCkyConsent = () => ({ categories: { advertisement: /advertisement:yes/.test(decodeURIComponent(document.cookie)) } });
  const set = (ad) => {
    document.cookie = "cookieyes-consent=" + encodeURIComponent("consentid:e2e,consent:yes,action:yes,necessary:yes,advertisement:" + (ad ? "yes" : "no")) + "; path=/";
    document.dispatchEvent(new CustomEvent("cookieyes_consent_update", { detail: { accepted: ad ? ["advertisement"] : [], rejected: ad ? [] : ["advertisement"] } }));
  };
  window.__ckyAccept = () => set(true);
  window.__ckyReject = () => set(false);
  window.__ckyLoaded = true;
  document.dispatchEvent(new CustomEvent("cookieyes_banner_load", { detail: {} }));
`;
// Napodobenina fbevents.js: zpracuje frontu a zaznamená každé volání.
const FAKE_FBEVENTS = `
  window.__meta = window.__meta || [];
  const f = window.fbq;
  f.callMethod = (...args) => window.__meta.push(JSON.parse(JSON.stringify(args)));
  for (const args of f.queue.splice(0)) f.callMethod(...args);
`;

const ORIGINAL_UUID = "0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11";
const browser = await chromium.launch({
  args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1, MAP moje.begina.cz 127.0.0.1`],
});
const pub = (path) => `http://begina.cz:${PORT}${path}`;

async function newPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const external = { cky: 0, fbevents: 0, facebook: 0 };
  await context.route("https://cdn-cookieyes.com/**", (route) => {
    external.cky++;
    return route.fulfill({ contentType: "application/javascript", body: FAKE_CKY });
  });
  await context.route("https://connect.facebook.net/**", (route) => {
    external.fbevents++;
    return route.fulfill({ contentType: "application/javascript", body: FAKE_FBEVENTS });
  });
  await context.route(/facebook\.com/, (route) => {
    external.facebook++;
    return route.abort();
  });
  return { context, page, external };
}
const meta = (page) => page.evaluate(() => window.__meta ?? []);
const tracks = async (page, event) => (await meta(page)).filter((a) => a[0] === "track" && a[1] === event);

try {
  if (MODE === "vypnuto") {
    // ------------------------------------------------ přepínač vypnutý (výchozí)
    const { page, external, context } = await newPage();
    await page.goto(pub("/produkt/kulajda"));
    await page.waitForTimeout(800);
    check("vypnuto: CookieYes se nenačte", external.cky === 0, JSON.stringify(external));
    check("vypnuto: nic na Facebook", external.fbevents === 0 && external.facebook === 0);
    check("vypnuto: v patičce není „Nastavení cookies“", (await page.getByRole("button", { name: "Nastavení cookies" }).count()) === 0);
    await context.close();
  } else {
    // ---------------------------------------------- bez souhlasu nic, pak souhlas
    const { page, external, context } = await newPage();
    await page.goto(pub("/produkt/kulajda"));
    await page.waitForFunction(() => window.__ckyLoaded === true);
    await page.getByRole("button", { name: "Do košíku" }).click();
    await page.waitForTimeout(500);
    check("CookieYes se načte jednou", external.cky === 1, JSON.stringify(external));
    check("bez souhlasu: fbevents.js se nenačte, nic na Facebook", external.fbevents === 0 && external.facebook === 0, JSON.stringify(external));
    check("„Nastavení cookies“ v patičce", (await page.getByRole("button", { name: "Nastavení cookies" }).count()) === 1);

    await page.evaluate(() => window.__ckyAccept());
    await page.waitForFunction(() => (window.__meta ?? []).some((a) => a[1] === "PageView"));
    const first = await meta(page);
    check(
      "po souhlasu: autoConfig vypnutý, init, PageView otevřené stránky",
      JSON.stringify(first.slice(0, 3)) === JSON.stringify([["set", "autoConfig", false, "2509610956071494"], ["init", "2509610956071494"], ["track", "PageView"]]),
      JSON.stringify(first)
    );
    check("AddToCart před souhlasem se zpětně neposlal", (await tracks(page, "AddToCart")).length === 0);
    await page.getByRole("button", { name: "Do košíku" }).click();
    const add = await tracks(page, "AddToCart");
    check("AddToCart po souhlasu", add.length === 1 && add[0][2].content_ids[0] === "kulajda" && add[0][2].currency === "CZK", JSON.stringify(add));

    // ------------------------------------------------ pokladna a nákup (jednou)
    await page.goto(pub("/pokladna"));
    await page.waitForFunction(() => (window.__meta ?? []).some((a) => a[1] === "InitiateCheckout"));
    check("InitiateCheckout jednou", (await tracks(page, "InitiateCheckout")).length === 1);
    await page.fill("#name", "Jana Testovací");
    await page.fill("#email", "jana@example.cz");
    await page.fill("#phone", "+420 777 123 456");
    await page.locator('input[name="shippingMethodId"][value="osobni-odber"]').check();
    await page.locator('input[name="termsAccepted"]').check();
    await page.getByRole("button", { name: /Odeslat|Objednat/ }).click();
    await page.getByText("Děkujeme za objednávku").waitFor();
    await page.waitForTimeout(800);
    const purchases = await tracks(page, "Purchase");
    check(
      "Purchase jednou, eventID podle VS (objednavka-7xxxxxxx), hodnota v Kč",
      purchases.length === 1 && /^objednavka-7\d{7}$/.test(purchases[0][3]?.eventID ?? "") && purchases[0][2].currency === "CZK" && purchases[0][2].value > 0,
      JSON.stringify(purchases)
    );
    const text = await page.locator("main").innerText();
    const vs = (purchases[0]?.[3]?.eventID ?? "").replace("objednavka-", "");
    check("číslo objednávky na potvrzení = VS z eventID (první objednávka na čisté DB = 70000001)", vs !== "" && text.includes(vs), vs);
    check("v událostech Meta není e-mail, jméno ani telefon", !/jana|Testovací|777/.test(JSON.stringify(await meta(page))));
    check("žádný přímý požadavek na facebook.com (jen napodobenina)", external.facebook === 0, JSON.stringify(external));
    await context.close();

    // ------------------------------------------ odvolání souhlasu = nic dalšího
    const second = await newPage();
    await second.page.goto(pub("/produkt/kulajda"));
    await second.page.waitForFunction(() => window.__ckyLoaded === true);
    await second.page.evaluate(() => window.__ckyAccept());
    await second.page.waitForFunction(() => (window.__meta ?? []).some((a) => a[1] === "PageView"));
    await second.page.evaluate(() => window.__ckyReject());
    await second.page.getByRole("button", { name: "Do košíku" }).click();
    await second.page.waitForTimeout(300);
    const after = await meta(second.page);
    check("odvolání: consent revoke, žádný AddToCart", after.some((a) => a[0] === "consent" && a[1] === "revoke") && !after.some((a) => a[1] === "AddToCart"), JSON.stringify(after));
    await second.context.close();

    // -------------------------------- stránka objednávky: nic, ani se souhlasem
    const third = await newPage();
    await third.context.addCookies([{ name: "cookieyes-consent", value: encodeURIComponent("advertisement:yes"), url: pub("/") }]);
    await third.page.goto(pub(`/objednavka/${ORIGINAL_UUID}`));
    await third.page.waitForTimeout(800);
    check("stránka objednávky: CookieYes ani Meta se nenačtou", third.external.cky === 0 && third.external.fbevents === 0, JSON.stringify(third.external));
    await third.context.close();
  }

  // --------------------------------------------- staré adresy produktů (oba režimy)
  const audit = readFileSync(new URL("../../docs/begina-cutover/audit-2026-10-10.md", import.meta.url), "utf8");
  const slugs = /Slugy produktů ve WooCommerce[^:]*: ([a-z0-9, -]+)/.exec(audit)[1].split(", ");
  const hidden = ["cervankove-nebe", "dum-u-jezera", "malinovy-svarak-nealko"];
  // Koncové lomítko odstraní už Next.js (308 = trvalé jako 301, relativní
  // adresa na téže doméně) — ještě před proxy.ts.
  const permanentTo = (res, path) =>
    [301, 308].includes(res.status) && [path, `https://begina.cz${path}`].includes(res.headers.location);
  for (const slug of slugs) {
    const old = await raw("begina.cz", `/produkt/${slug}/`);
    const target = await raw("begina.cz", `/produkt/${slug}`);
    const okOld = permanentTo(old, `/produkt/${slug}`);
    const okNew = hidden.includes(slug)
      ? target.status === 307 && target.headers.location === "/kategorie/ovocne-napoje"
      : target.status === 200 && target.body.includes("<h1");
    check(`/produkt/${slug}/ → ${hidden.includes(slug) ? "307 Ovocné nápoje" : "200"}`, okOld && okNew, `${old.status} ${old.headers.location} → ${target.status} ${target.headers.location ?? ""}`);
  }
  // www.begina.cz/produkt/x/ → (308 bez lomítka) → 301 https://begina.cz/produkt/x
  const www1 = await raw("www.begina.cz", "/produkt/kulajda/");
  const www2 = www1.headers.location ? await raw("www.begina.cz", www1.headers.location) : www1;
  check("www.begina.cz/produkt/kulajda/ → begina.cz/produkt/kulajda", permanentTo(www1, "/produkt/kulajda") && www2.status === 301 && www2.headers.location === "https://begina.cz/produkt/kulajda", `${www1.status} ${www1.headers.location} → ${www2.status} ${www2.headers.location}`);
  const oldCategory = await raw("begina.cz", "/kategorie-produktu/ovocne-napoje/");
  const oldCategory2 = await raw("begina.cz", oldCategory.headers.location ?? "/");
  check("/kategorie-produktu/ovocne-napoje/ → /kategorie/ovocne-napoje", permanentTo(oldCategory, "/kategorie-produktu/ovocne-napoje") && oldCategory2.status === 301 && oldCategory2.headers.location === "https://begina.cz/kategorie/ovocne-napoje", `${oldCategory.status} → ${oldCategory2.status} ${oldCategory2.headers.location}`);
  const category = await raw("begina.cz", "/kategorie/ovocne-napoje");
  check("Ovocné nápoje = 200 „Připravujeme“ (produkty skryté)", category.status === 200 && category.body.includes("Připravujeme"), String(category.status));
  const internalHidden = await raw("moje.begina.cz", "/eshop/produkt/cervankove-nebe");
  check("moje.begina.cz/eshop: skrytý produkt → /eshop/kategorie/ovocne-napoje", internalHidden.status === 307 && internalHidden.headers.location === "/eshop/kategorie/ovocne-napoje", `${internalHidden.status} ${internalHidden.headers.location}`);
  const unknown = await raw("begina.cz", "/produkt/neexistuje");
  check("neznámý produkt = 404", unknown.status === 404, String(unknown.status));
} finally {
  await browser.close();
}

for (const line of passed) console.log(`OK   ${line}`);
for (const line of failures) console.log(`CHYBA ${line}`);
console.log(`\n${passed.length} OK, ${failures.length} chyb (${MODE})`);
process.exit(failures.length ? 1 : 0);

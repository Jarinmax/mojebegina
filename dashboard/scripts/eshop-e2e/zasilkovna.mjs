// ESHOP — Zásilkovna pro kapsičky sirupu v prohlížeči nad sestavenou aplikací
// (next start + testovací DB neon-http-pglite.mjs). Mapa Zásilkovny se
// nevolá — window.Packeta je náhražka, která vrátí pevné výdejní místo.
// Nic neodchází ven.
//
// Spuštění (po `next build`):
//   PORT=3102 DATABASE_URL=postgresql://u:p@ep-test.neon.tech/neondb \
//   E2E_ORDER_NUMBERING=vs E2E_SQL_PORT=4998 E2E_WEIGHTS=1 \
//   E2E_CATALOG_SQL=31_sirupy.sql,41_polevky.sql \
//   ESHOP_WEIGHT_SHIPPING=on ESHOP_ZASILKOVNA=on \
//   NODE_OPTIONS="--import ./scripts/eshop-e2e/neon-http-pglite.mjs" npx next start -p 3102 &
//   node scripts/eshop-e2e/zasilkovna.mjs 3102 [adresář pro snímky]
import http from "node:http";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3102);
const SHOTS = process.argv[3] ?? null;
const SQL_PORT = Number(process.env.E2E_SQL_PORT ?? 4998);
const failures = [];
const passed = [];
const check = (name, ok, detail = "") => (ok ? passed : failures).push(`${name}${detail ? ` — ${detail}` : ""}`);

function query(text) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: SQL_PORT, method: "POST", path: "/" }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => (res.statusCode === 200 ? resolve(JSON.parse(data)) : reject(new Error(data))));
    });
    req.on("error", reject);
    req.end(text);
  });
}

const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1`] });
const pub = (path) => `http://begina.cz:${PORT}${path}`;
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
// mapa Zásilkovny se v testu nenačítá
await page.route("**/widget.packeta.com/**", (route) => route.abort());
const text = (s) => s.replace(/\s+/g, " ");
const summary = async () => text(await page.locator("aside").innerText());
const deliveryBox = async () => text(await page.locator("fieldset", { hasText: "Doručení" }).innerText());
const radio = (id) => page.locator(`input[name="shippingMethodId"][value="${id}"]`);

async function checkout(cart) {
  await page.goto(pub("/"));
  await page.evaluate((c) => localStorage.setItem("begina-eshop-cart-v2", JSON.stringify(c)), cart);
  await page.goto(pub("/pokladna"));
  await page.waitForSelector('input[name="shippingMethodId"]');
}

try {
  await query(`UPDATE product_variants SET weight_g = 805 WHERE volume_ml = 650`);
  const pouches = await query(
    `SELECT v.sku FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id
      WHERE c.slug = 'sirupy' AND v.volume_ml = 650 AND v.is_active ORDER BY v.sku LIMIT 2`
  );
  const [a, b] = pouches.map((row) => row.sku);

  // 1 kapsička → Zásilkovna první, předvybraná, 104 Kč
  await checkout([{ sku: a, quantity: 1 }]);
  check("1 kapsička: Zásilkovna je v nabídce", (await radio("zasilkovna").count()) === 1, await deliveryBox());
  check("1 kapsička: Zásilkovna předvybraná", await radio("zasilkovna").isChecked());
  check("1 kapsička: 104 Kč v souhrnu, celkem 303 Kč", /Zásilkovna.* 104 Kč/.test(await summary()) && /Celkem 303 Kč/.test(await summary()), await summary());
  check("chlazená přeprava zůstává na výběr za 267 Kč", /Chlazená přeprava 267 Kč/.test(await deliveryBox()), await deliveryBox());
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/zasilkovna-pokladna.png`, fullPage: true });

  // bez výdejního místa server objednávku odmítne
  await page.fill("#name", "Jana Nováková");
  await page.fill("#email", "jana@example.cz");
  await page.fill("#phone", "+420 777 123 456");
  await page.fill("#billingStreet", "Prvního pluku 14");
  await page.fill("#billingCity", "Praha");
  await page.fill("#billingZip", "186 00");
  await page.check('input[name="termsAccepted"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector('aside [role="alert"]');
  const noPoint = text(await page.locator('aside [role="alert"]').innerText());
  check("bez výdejního místa: odmítnuto", noPoint.includes("Vyberte prosím výdejní místo nebo Z-BOX Zásilkovny."), noPoint);

  // výběr místa (náhražka mapy) → objednávka se uloží s výdejním místem
  await page.evaluate(() => {
    window.Packeta = {
      Widget: {
        pick: (_key, cb) => cb({ id: 1234, name: "Z-BOX Kolín, Benešova 12", street: "Benešova 12", city: "Kolín", zip: "280 02", country: "cz" }),
      },
    };
  });
  await page.click("text=Vybrat výdejní místo nebo Z-BOX");
  await page.waitForSelector("text=Změnit výdejní místo");
  check("vybrané místo je vidět", (await deliveryBox()).includes("Z-BOX Kolín, Benešova 12"), await deliveryBox());
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/zasilkovna-vybrane-misto.png`, fullPage: true });
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Děkujeme za objednávku", { timeout: 30_000 });
  const [order] = await query(
    `SELECT shipping_method_code, shipping_kc, subtotal_kc, total_kc, recipient_company, recipient_address
       FROM orders WHERE channel = 'eshop' ORDER BY created_at DESC LIMIT 1`
  );
  check(
    "uloženo: Zásilkovna 104 Kč, celkem 303 Kč, výdejní místo s ID",
    JSON.stringify(order) ===
      JSON.stringify({
        shipping_method_code: "zasilkovna",
        shipping_kc: 104,
        subtotal_kc: 199,
        total_kc: 303,
        recipient_company: "Zásilkovna: Z-BOX Kolín, Benešova 12 (ID 1234)",
        recipient_address: "Benešova 12, 280 02 Kolín",
      }),
    JSON.stringify(order)
  );

  // 4 kapsičky ze dvou druhů → pořád 104 Kč
  await checkout([{ sku: a, quantity: 2 }, { sku: b, quantity: 2 }]);
  check("4 kapsičky: Zásilkovna 104 Kč", (await radio("zasilkovna").isChecked()) && /Zásilkovna.* 104 Kč/.test(await summary()), await summary());

  // 5 kapsiček → Zásilkovna se nenabízí
  await checkout([{ sku: a, quantity: 5 }]);
  check("5 kapsiček: Zásilkovna se nenabízí", (await radio("zasilkovna").count()) === 0, await deliveryBox());
  check("5 kapsiček: předvybraná chlazená přeprava", await radio("rozvoz").isChecked());

  // kapsička + polévka → Zásilkovna se nenabízí
  await checkout([{ sku: a, quantity: 1 }, { sku: "kulajda", quantity: 1 }]);
  check("kapsička + polévka: Zásilkovna se nenabízí", (await radio("zasilkovna").count()) === 0, await deliveryBox());

  // stránka Doprava
  await page.goto(pub("/doprava"));
  const shipping = text(await page.locator("main").innerText());
  check("Doprava: Zásilkovna 104 Kč", /Zásilkovna – výdejní místo nebo Z-BOX — 104 Kč/.test(shipping), shipping.slice(0, 400));
} catch (error) {
  failures.push(`výjimka: ${error.stack ?? error}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/zasilkovna-chyba.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

for (const line of passed) console.log(`OK   ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`\n${passed.length} OK, ${failures.length} FAIL`);
process.exit(failures.length ? 1 : 0);

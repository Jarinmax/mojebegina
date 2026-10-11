// ESHOP — chlazená přeprava podle hmotnosti v prohlížeči nad sestavenou
// aplikací (next start + testovací DB neon-http-pglite.mjs s hmotnostmi
// ze skriptu docs/eshop-production/41_hmotnosti.sql). Nic neodchází ven.
//
// Spuštění (po `next build`):
//   PORT=3102 DATABASE_URL=postgresql://u:p@ep-test.neon.tech/neondb \
//   E2E_ORDER_NUMBERING=vs E2E_SQL_PORT=4998 E2E_WEIGHTS=1 \
//   E2E_CATALOG_SQL=31_sirupy.sql,41_polevky.sql,51_caje.sql,61_zmrzliny.sql,71_ovocne_napoje.sql \
//   [ESHOP_WEIGHT_SHIPPING=on] \
//   NODE_OPTIONS="--import ./scripts/eshop-e2e/neon-http-pglite.mjs" npx next start -p 3102 &
//   node scripts/eshop-e2e/shipping.mjs 3102 [hmotnost|pausal] [adresář pro snímky]
import http from "node:http";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3102);
const MODE = process.argv[3] ?? "hmotnost";
const SHOTS = process.argv[4] ?? null;
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const text = (s) => s.replace(/\s+/g, " ");

async function checkout(cart) {
  await page.goto(pub("/"));
  await page.evaluate((c) => localStorage.setItem("begina-eshop-cart-v2", JSON.stringify(c)), cart);
  await page.goto(pub("/pokladna"));
  await page.waitForSelector('input[name="shippingMethodId"]');
}
const coldRadio = () => page.locator('input[name="shippingMethodId"][value="rozvoz"]');
const summary = async () => text(await page.locator("aside").innerText());
const deliveryBox = async () => text(await page.locator("fieldset", { hasText: "Doručení" }).innerText());

try {
  if (MODE === "pausal") {
    await checkout([{ sku: "kulajda", quantity: 51 }]);
    check("paušál: chlazená přeprava dostupná i nad 150 kg (beze změny)", await coldRadio().isEnabled());
    await coldRadio().check();
    check("paušál: 99 Kč v souhrnu", /Chlazená přeprava 99 Kč/.test(await summary()), await summary());
    await page.goto(pub("/doprava"));
    const shipping = text(await page.locator("main").innerText());
    check("paušál: stránka Doprava bez nového ceníku", !shipping.includes("14,99 kg") && shipping.includes("99 Kč"), shipping.slice(0, 300));
  } else {
    // 1× polévka 3 l = 3 kg → 267 Kč
    await checkout([{ sku: "kulajda", quantity: 1 }]);
    check("osobní odběr vybraný a zdarma", /Osobní vyzvednutí.*Zdarma/.test(await deliveryBox()));
    await coldRadio().check();
    check("3 kg → 267 Kč v nabídce i souhrnu", /Chlazená přeprava 267 Kč/.test(await summary()), await summary());
    check("celkem 379 + 267 = 646 Kč", /Celkem 646 Kč/.test(await summary()), await summary());
    check("u adresy: jen Česká republika", (await deliveryBox()).includes("Doručujeme jen v České republice."));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/doprava-3kg.png`, fullPage: true });

    // 5× 3 l ze dvou SKU = 15 kg → 379 Kč; objednávka se uloží s cenou ze serveru
    await checkout([
      { sku: "kulajda", quantity: 3 },
      { sku: "lipovy-caj-3l", quantity: 2 },
    ]);
    await coldRadio().check();
    check("15 kg → 379 Kč", /Chlazená přeprava 379 Kč/.test(await summary()), await summary());
    await page.fill("#name", "Jana Nováková");
    await page.fill("#email", "jana@example.cz");
    await page.fill("#phone", "+420 777 123 456");
    await page.fill("#street", "Prvního pluku 14");
    await page.fill("#city", "Praha");
    await page.fill("#zip", "811 01");
    await page.check('input[name="termsAccepted"]');
    await page.click('button[type="submit"]');
    await page.waitForSelector('aside [role="alert"]');
    const zipError = text(await page.locator('aside [role="alert"]').innerText());
    check("slovenské PSČ odmítnuto serverem", zipError.includes("Doručujeme jen v České republice — zadejte prosím české PSČ."), zipError);
    await page.fill("#zip", "186 00");
    await page.click('button[type="submit"]');
    await page.waitForSelector("text=Děkujeme za objednávku", { timeout: 30_000 });
    const confirmation = text(await page.locator("main").innerText());
    check("potvrzení: doprava 379 Kč", /Chlazená přeprava 379 Kč/.test(confirmation), confirmation.slice(0, 400));
    const [order] = await query(
      `SELECT subtotal_kc, shipping_kc, total_kc FROM orders WHERE channel = 'eshop' ORDER BY created_at DESC LIMIT 1`
    );
    check(
      "uloženo: zboží 1 655, doprava 379, celkem 2 034",
      JSON.stringify(order) === JSON.stringify({ subtotal_kc: 1655, shipping_kc: 379, total_kc: 2034 }),
      JSON.stringify(order)
    );

    // 51× 3 l = 153 kg → chlazená přeprava nedostupná, individuální domluva
    await checkout([{ sku: "kulajda", quantity: 51 }]);
    check("153 kg: chlazená přeprava zakázaná", !(await coldRadio().isEnabled()));
    const box = await deliveryBox();
    check("153 kg: text s váhou a kontaktem", /Objednávka váží 153 kg.*nad 150 kg nelze objednat automaticky.*info@begina\.cz.*\+420 774 199 975/.test(box), box);
    check("153 kg: v nabídce „Individuálně“", /Chlazená přeprava Individuálně/.test(box));
    check("153 kg: osobní odběr zůstává zdarma", /Osobní vyzvednutí.*Zdarma/.test(box) && /Osobní vyzvednutí.* 0 Kč/.test(await summary()));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/doprava-nad-150kg.png`, fullPage: true });

    // podvržený formulář: chlazená přeprava nad 150 kg → server odmítne
    for (const [id, value] of [["#name", "Jana"], ["#email", "jana@example.cz"], ["#phone", "+420 777 123 456"]]) await page.fill(id, value);
    await page.check('input[name="termsAccepted"]');
    const [{ n: before }] = await query(`SELECT count(*)::int AS n FROM orders`);
    // vše v jednom kroku — React by jinak při překreslení vrátil řízený výběr zpět
    await page.evaluate(() => {
      const form = document.querySelector("form");
      const radio = document.querySelector('input[name="shippingMethodId"][value="rozvoz"]');
      radio.disabled = false;
      radio.checked = true;
      const add = (name, value) => {
        const input = document.createElement("input");
        Object.assign(input, { type: "hidden", name, value });
        form.appendChild(input);
      };
      add("street", "Prvního pluku 14");
      add("city", "Praha");
      add("zip", "18600");
      document.querySelector('button[type="submit"]').disabled = false;
      form.requestSubmit();
    });
    await page.waitForSelector('aside [role="alert"]', { timeout: 30_000 });
    check("podvržené nad 150 kg: server odmítne", (await summary()).includes("nelze objednat automaticky"));
    const [{ n: after }] = await query(`SELECT count(*)::int AS n FROM orders`);
    check("podvržené nad 150 kg: nic se neuložilo", before === after, `${before} → ${after}`);

    // stránka Doprava a platba
    await page.goto(pub("/doprava"));
    const shipping = text(await page.locator("main").innerText());
    check("Doprava: ceník 0–14,99 kg — 267 Kč", shipping.includes("0–14,99 kg — 267 Kč"));
    check("Doprava: 100–150 kg — 1 839 Kč", /100–150 kg — 1\s839 Kč/.test(shipping));
    check("Doprava: nad 150 kg individuálně", shipping.includes("Objednávky nad 150 kg"));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/doprava-stranka.png`, fullPage: true });

    // mobil: nabídka čitelná bez vodorovného posunu
    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await mobile.goto(pub("/"));
    await mobile.evaluate(() => localStorage.setItem("begina-eshop-cart-v2", JSON.stringify([{ sku: "kulajda", quantity: 51 }])));
    await mobile.goto(pub("/pokladna"));
    await mobile.waitForSelector('input[name="shippingMethodId"]');
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check("mobil: bez vodorovného posunu", !overflow);
    if (SHOTS) await mobile.screenshot({ path: `${SHOTS}/doprava-mobil-nad-150kg.png`, fullPage: true });
  }
} catch (error) {
  failures.push(`výjimka: ${error.stack ?? error}`);
} finally {
  await browser.close();
}

for (const line of passed) console.log(`OK   ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log(`${passed.length} OK, ${failures.length} FAIL`);
process.exit(failures.length === 0 ? 0 : 1);

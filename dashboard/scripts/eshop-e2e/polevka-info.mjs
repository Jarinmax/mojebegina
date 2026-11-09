// ESHOP — tabulka „Informace o potravině“ u polévky (9. 11. 2026) v prohlížeči
// nad sestavenou aplikací: řádky Skladování, Trvanlivost, Příprava, Vrácení
// a reklamace; klikací odkaz na obchodní podmínky; mobil i počítač.
// Spuštění jako hero.mjs (next start + neon-http-pglite), snímky do OUT_DIR.
import { mkdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/hero";
mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });
const url = (p) => `http://begina.cz:${PORT}${p}`;

for (const [name, viewport] of [["mobil", { width: 390, height: 844 }], ["pocitac", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(url("/produkt/kulajda"), { waitUntil: "networkidle" });
  const section = page.locator("section[aria-labelledby=food-info]");
  const labels = await section.locator("dt").allTextContents();
  check(`${name}: řádky`, ["Skladování", "Trvanlivost", "Příprava", "Vrácení a reklamace"].every((l) => labels.includes(l)), labels.join(" | "));
  const returns = await section.locator("dt:text-is('Vrácení a reklamace') + dd").textContent();
  check(`${name}: text vrácení`, /nelze odstoupit od smlouvy bez udání důvodu/.test(returns ?? "") && /čl\. VII a VIII obchodních podmínek\./.test(returns ?? ""), returns ?? "");
  const storage = await section.locator("dt:text-is('Skladování') + dd").textContent();
  check(`${name}: skladování bez právní věty`, !/odstoupení|nelze jej vrátit/.test(storage ?? ""), storage ?? "");
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: bez vodorovného posuvníku`, scrollW <= viewport.width, String(scrollW));
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: `${OUT}/polevka-info-${name}.jpg`, type: "jpeg", quality: 75 });
  await Promise.all([page.waitForURL(url("/obchodni-podminky")), section.getByRole("link", { name: "obchodních podmínek" }).click()]);
  check(`${name}: odkaz na obchodní podmínky`, page.url() === url("/obchodni-podminky"), page.url());
  await page.close();
}
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) {
  console.log(fails.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

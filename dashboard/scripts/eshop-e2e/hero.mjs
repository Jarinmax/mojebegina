// ESHOP — úvod e-shopu (návrh 8. 11. 2026) v prohlížeči nad sestavenou
// aplikací (next start + testovací DB neon-http-pglite.mjs): obě tlačítka
// vedou na existující kategorie, fotografie je celá (neořezaná, 3 : 2)
// a na mobilu je text nad fotografií, na počítači vedle ní. Snímky obrazovky
// pro kontrolu do OUT_DIR (výchozí /tmp/hero).
//
// Spuštění (po `next build`):
//   PORT=3100 DATABASE_URL=postgresql://u:p@ep-test.neon.tech/neondb \
//   NODE_OPTIONS="--import ./scripts/eshop-e2e/neon-http-pglite.mjs" npx next start -p 3100 &
//   node scripts/eshop-e2e/hero.mjs 3100
import { mkdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/hero";
mkdirSync(OUT, { recursive: true });
const failures = [];
const passed = [];
const check = (name, ok, detail = "") => (ok ? passed : failures).push(`${name}${detail ? ` — ${detail}` : ""}`);

const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1`] });
const url = (path) => `http://begina.cz:${PORT}${path}`;
const viewports = [
  ["mobil", { width: 390, height: 844 }],
  ["tablet", { width: 820, height: 1180 }],
  ["pocitac", { width: 1440, height: 900 }],
];

for (const [name, viewport] of viewports) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(url("/"), { waitUntil: "networkidle" });
  const h1 = page.locator("h1");
  const img = page.getByRole("img", { name: /dýňová polévka/i });
  await img.evaluate((el) => (el.complete ? null : new Promise((r) => el.addEventListener("load", r, { once: true }))));
  const h = await h1.boundingBox();
  const i = await img.boundingBox();
  const natural = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight, cw: el.clientWidth, ch: el.clientHeight, fit: getComputedStyle(el).objectFit }));
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: bez vodorovného posuvníku`, scrollW <= viewport.width, `scrollWidth ${scrollW}`);
  check(`${name}: fotografie načtená`, natural.w > 0, `${natural.w}×${natural.h}`);
  check(`${name}: fotografie nedeformovaná`, Math.abs(natural.cw / natural.ch - 1672 / 941) < 0.02, `${natural.cw}×${natural.ch} ${natural.fit}`);
  if (name === "pocitac") check(`${name}: text vlevo, fotografie vpravo`, h.x + h.width <= i.x + 1 && Math.abs(h.y + h.height / 2 - (i.y + i.height / 2)) < i.height, `h1 x=${h.x} img x=${i.x}`);
  else check(`${name}: text nad fotografií`, h.y + h.height <= i.y, `h1 ${h.y}+${h.height} img ${i.y}`);
  const fs = await h1.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check(`${name}: nadpis není přehnaně velký`, fs <= 52, `${fs}px`);
  await page.screenshot({ path: `${OUT}/hero-${name}.jpg`, type: "jpeg", quality: 70, fullPage: false });

  for (const [label, path, heading] of [
    ["Vybrat polévku", "/kategorie/polevky", /polévky/i],
    ["Objevit sirupy", "/kategorie/sirupy", /sirupy/i],
  ]) {
    await page.goto(url("/"), { waitUntil: "networkidle" });
    await Promise.all([page.waitForURL(url(path)), page.getByRole("link", { name: label }).click()]);
    const title = await page.locator("h1").first().textContent();
    check(`${name}: „${label}“ → ${path}`, page.url() === url(path) && heading.test(title ?? ""), `${page.url()} „${title}“`);
  }
  await page.close();
}
await browser.close();
console.log(passed.map((p) => `✓ ${p}`).join("\n"));
if (failures.length) {
  console.log(failures.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

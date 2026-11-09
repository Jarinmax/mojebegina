// begina.cz — pruh kategorií na úvodu: ikona Alkoholické koktejly
// (Cosmopolitan, 9. 11. 2026) se načte, má průhledné pozadí, podobnou
// velikost jako ostatní ikony a vede na kategorii. Počítač, iPad, mobil.
//   node scripts/eshop-e2e/ikony.mjs 3100
import { mkdirSync } from "node:fs";

const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/ikony";
mkdirSync(OUT, { recursive: true });
const failures = [];
const passed = [];
const check = (name, ok, detail = "") => (ok ? passed : failures).push(`${name}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1`] });
const url = (p) => `http://begina.cz:${PORT}${p}`;
const CASES = [
  ["pocitac", { viewport: { width: 1440, height: 900 } }],
  ["ipad-vysku", devices["iPad (gen 7)"]],
  ["ipad-sirku", devices["iPad (gen 7) landscape"]],
  ["iphone-vysku", devices["iPhone 13"]],
  ["iphone-sirku", devices["iPhone 13 landscape"]],
];
for (const [name, device] of CASES) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const vw = page.viewportSize().width;
  await page.goto(url("/"), { waitUntil: "networkidle" });
  const strip = page.locator('nav[aria-label="Kategorie"]');
  await strip.scrollIntoViewIfNeeded();
  const link = strip.getByRole("link", { name: "Alkoholické koktejly" });
  check(`${name}: odkaz a název zachované`, (await link.getAttribute("href")) === "/kategorie/koktejly" && (await link.isVisible()));
  const info = await strip.evaluate((nav) =>
    [...nav.querySelectorAll("img")].map((img) => {
      const b = img.getBoundingClientRect();
      return { src: img.currentSrc || img.src, ok: img.complete && img.naturalWidth > 0, h: b.height, w: b.width, label: img.closest("a").textContent.trim() };
    })
  );
  const k = info.find((i) => i.label === "Alkoholické koktejly");
  check(`${name}: nová ikona Cosmopolitan načtená`, k && k.ok && /ikona-koktejly-cosmopolitan/.test(decodeURIComponent(k.src)), k?.src);
  const others = info.filter((i) => i !== k).map((i) => i.h);
  const avg = others.reduce((a, b) => a + b, 0) / others.length;
  check(`${name}: velikost podobná ostatním`, Math.abs(k.h - avg) / avg < 0.2 && k.h > 40, `koktejl ${Math.round(k.w)}×${Math.round(k.h)}, ostatní výška ⌀ ${Math.round(avg)}`);
  // průhledné pozadí: roh ikony má barvu lišty
  const corner = await strip.evaluate(async (nav) => {
    const img = [...nav.querySelectorAll("img")].find((i) => i.closest("a").textContent.includes("koktejly"));
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    return [...g.getImageData(1, 1, 1, 1).data];
  });
  check(`${name}: průhledné pozadí`, corner[3] === 0, `roh ${corner}`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: bez vodorovného přetékání`, sw <= vw, `${sw}/${vw}`);
  await strip.screenshot({ path: `${OUT}/lista-${name}.jpg`, type: "jpeg", quality: 70 });
  await Promise.all([page.waitForURL(url("/kategorie/koktejly")), link.click()]);
  check(`${name}: klik → kategorie`, /Alkoholické koktejly/.test(await page.locator("h1").first().textContent()));
  await ctx.close();
}
await browser.close();
console.log(passed.map((p) => `✓ ${p}`).join("\n"));
if (failures.length) {
  console.log(failures.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

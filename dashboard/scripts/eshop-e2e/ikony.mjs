// begina.cz — pruh kategorií na úvodu (jednotná sada ikon 9. 11. 2026):
// každá ikona se načte, má průhledné pozadí a stejnou výšku i zem jako
// ostatní; názvy a odkazy kategorií beze změny. Počítač, iPad, mobil.
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
  const info = await strip.evaluate((nav) =>
    [...nav.querySelectorAll("a")].map((a) => {
      const img = a.querySelector("img");
      const b = img.getBoundingClientRect();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      return { label: a.textContent.trim(), href: a.getAttribute("href"), src: decodeURIComponent(img.currentSrc || img.src), ok: img.complete && img.naturalWidth > 0,
        h: Math.round(b.height), bottom: Math.round(b.bottom), alpha: [...g.getImageData(1, 1, 1, 1).data][3] };
    })
  );
  const EXPECT = { "Čerstvé polévky": "polevky", "Bylinné sirupy": "sirupy", "Čaje": "caje", "Ovocné nápoje": "ovocne-napoje", "Alkoholické koktejly": "koktejly", "Zmrzliny": "zmrzliny" };
  for (const i of info) {
    const slug = EXPECT[i.label];
    check(`${name}: ${i.label} — odkaz, nová ikona, průhledné pozadí`, slug && i.href === `/kategorie/${slug}` && i.ok && i.src.includes(`ikona-${slug}-2026-11`) && i.alpha <= 8, `${i.href} ${i.ok ? "načtená" : "NENAČTENÁ"} alfa ${i.alpha}`);
  }
  const hs = [...new Set(info.map((i) => i.h))];
  const rows = {};
  for (const i of info) (rows[i.bottom] ??= []).push(i.label);
  check(`${name}: stejná výška a zarovnání ikon`, hs.length === 1 && hs[0] >= 50, `výška ${hs.join("/")} px, řady podle spodní hrany: ${Object.values(rows).map((r) => r.length).join("+")}`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: bez vodorovného přetékání`, sw <= vw, `${sw}/${vw}`);
  await strip.screenshot({ path: `${OUT}/lista-${name}.jpg`, type: "jpeg", quality: 70 });
  const link = strip.getByRole("link", { name: "Alkoholické koktejly" });
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

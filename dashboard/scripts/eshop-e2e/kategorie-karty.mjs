// Posuvný přehled kategorií (10. 11. 2026): fotka souvisle bez pruhu, název
// pod ní na bílém, celá karta odkaz, stejné velikosti; nadpis O vodě.
import { mkdirSync } from "node:fs";
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/karty";
mkdirSync(OUT, { recursive: true });
const fails = [], ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });
const url = (p) => `http://begina.cz:${PORT}${p}`;
for (const [name, device] of [["pocitac", { viewport: { width: 1440, height: 900 } }], ["ipad", devices["iPad (gen 7)"]], ["mobil", devices["iPhone 13"]]]) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const vw = page.viewportSize().width;
  for (const path of ["/o-nas", "/o-vode", "/o-baleni", "/doprava"]) {
    await page.goto(url(path), { waitUntil: "networkidle" });
    const cards = await page.locator('main ul a[href^="/kategorie/"]').evaluateAll((as) =>
      as.map((a) => {
        const img = a.querySelector("span img") ?? a.querySelector("img");
        const label = a.lastElementChild;
        const r = a.getBoundingClientRect(), ir = a.firstElementChild.getBoundingClientRect(), lr = label.getBoundingClientRect();
        const st = getComputedStyle(label);
        return { href: a.getAttribute("href"), w: Math.round(r.width), h: Math.round(r.height), photoBottom: ir.bottom, labelTop: lr.top, labelText: label.textContent.trim(),
          labelBg: st.backgroundColor, cardBg: getComputedStyle(a).backgroundColor, overlays: a.querySelectorAll(".absolute.inset-x-0").length, imgPos: img ? getComputedStyle(img).objectPosition : null };
      })
    );
    check(`${name} ${path}: šest karet`, cards.length === 6, cards.map((c) => c.href).join(" "));
    check(`${name} ${path}: název pod fotkou, žádný pruh přes fotku`, cards.every((c) => c.labelTop >= c.photoBottom - 1 && c.overlays === 0 && c.labelText.length > 0), cards.map((c) => `${c.labelText}:${Math.round(c.labelTop - c.photoBottom)}`).join(" "));
    check(`${name} ${path}: stejná velikost karet`, new Set(cards.map((c) => `${c.w}x${c.h}`)).size === 1, [...new Set(cards.map((c) => `${c.w}x${c.h}`))].join(" "));
    check(`${name} ${path}: fotka zarovnaná dolů (bez zapečeného pruhu)`, cards.filter((c) => c.imgPos && c.labelText !== "Zmrzliny").every((c) => /100%$/.test(c.imgPos)), cards.map((c) => c.imgPos).join(" "));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${name} ${path}: bez přetékání`, sw <= vw, `${sw}/${vw}`);
    if (path === "/o-vode") {
      const h1 = await page.locator("h1").evaluate((el) => ({ t: el.textContent, fs: parseFloat(getComputedStyle(el).fontSize), lh: parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize), br: el.querySelectorAll("br").length }));
      check(`${name}: nadpis O vodě`, h1.t === "Čistá filtrovaná voda" && h1.br === 0 && (name !== "mobil" || (h1.fs === 24 && Math.abs(h1.lh - 1.25) < 0.01)), `${h1.t} ${h1.fs}px / ${h1.lh.toFixed(2)}`);
      await page.locator("main").screenshot({ path: `${OUT}/o-vode-${name}.jpg`, type: "jpeg", quality: 65 });
    }
  }
  // celá karta je odkaz: klik na fotku i na název
  await page.goto(url("/o-nas"), { waitUntil: "networkidle" });
  const first = page.locator('main ul a[href^="/kategorie/"]').first();
  const href = await first.getAttribute("href");
  await Promise.all([page.waitForURL(url(href)), first.locator("span").first().click({ position: { x: 20, y: 20 } })]);
  check(`${name}: klik na fotku → ${href}`, page.url() === url(href));
  await page.goto(url("/o-nas"), { waitUntil: "networkidle" });
  await Promise.all([page.waitForURL(url(href)), first.locator("span").last().click()]);
  check(`${name}: klik na název → ${href}`, page.url() === url(href));
  await ctx.close();
}
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) { console.log(fails.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

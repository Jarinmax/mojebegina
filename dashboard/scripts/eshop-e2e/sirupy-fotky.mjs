// ESHOP — nové fotky sirupů (10. 11. 2026): pořadí hlavní / sáček / doypack,
// celé (contain), mobil + počítač. BASE=https://begina.cz pro ostrý web.
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/hero";
const BASE = process.env.BASE ?? `http://begina.cz:${PORT}`;
mkdirSync(OUT, { recursive: true });
const fails = []; let ok = 0;
const check = (n, c, d = "") => (c ? ok++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const browser = await chromium.launch(process.env.BASE ? {} : { args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });
const SYR = ["bylinny-sirup-saman", "zazvorovy-sirup", "lipovy-sirup", "ibiskovy-sirup", "sipkovy-sirup", "hermankovy-sirup", "medunkovy-sirup-s-levanduli"];
const decoded = (src) => decodeURIComponent(new URL(src, BASE).searchParams.get("url") ?? new URL(src, BASE).pathname);
for (const [name, viewport] of [["mobil", { width: 390, height: 844 }], ["pocitac", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${BASE}/kategorie/sirupy?t=${Date.now()}`, { waitUntil: "networkidle" });
  const urls = (await page.locator("main img").evaluateAll((is) => is.map((i) => i.currentSrc || i.src))).map(decoded);
  check(`${name} katalog: 7 hlavních fotek`, SYR.every((s) => urls.includes(`/eshop/sirupy/${s}-hlavni.jpg`)), urls.join(","));
  await page.screenshot({ path: `${OUT}/sirupy-katalog-${name}.jpg`, type: "jpeg", quality: 70, fullPage: true });
  for (const slug of SYR) {
    await page.goto(`${BASE}/produkt/${slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
    const g = page.locator("div.md\\:sticky").first();
    const exp = ["hlavni", "sacek", ...(slug.startsWith("medunkovy") ? [] : ["doypack"])].map((k) => `/eshop/sirupy/${slug}-${k}.jpg`);
    const thumbs = g.locator("ul button");
    check(`${name} ${slug}: ${exp.length} náhledy`, (await thumbs.count()) === exp.length, String(await thumbs.count()));
    for (let i = 0; i < exp.length; i++) {
      if (i) { await thumbs.nth(i).click(); await page.waitForTimeout(300); }
      const info = await g.locator("img").first().evaluate((im) => ({ src: im.currentSrc || im.src, fit: getComputedStyle(im).objectFit }));
      check(`${name} ${slug}: fotka ${i + 1}`, decoded(info.src) === exp[i] && info.fit === "contain", `${decoded(info.src)} ${info.fit}`);
    }
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    check(`${name} ${slug}: sdílení = hlavní`, (og ?? "").includes(exp[0]), og ?? "-");
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${name} ${slug}: bez posouvání`, sw <= viewport.width, String(sw));
  }
  await page.close();
}
await browser.close();
console.log(`✓ ${ok} kontrol`);
if (fails.length) { console.log(fails.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

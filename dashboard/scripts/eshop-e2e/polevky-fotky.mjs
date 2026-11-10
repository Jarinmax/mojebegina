// ESHOP — nové fotografie polévek (10. 11. 2026): hlavní fotka = miska,
// druhá v galerii = sáček s kohoutkem; celé fotky bez ořezu (object-contain),
// náhled při sdílení; mobil, tablet, počítač. Snímky do OUT_DIR.
// BASE=https://begina.cz pro ostrý web (bez přesměrování na localhost).
import { mkdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/hero";
const BASE = process.env.BASE ?? `http://begina.cz:${PORT}`;
mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch(process.env.BASE ? {} : { args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });
const SOUPS = ["dynova-polevka", "kulajda", "rajcatova-polevka", "rajcatova-polevka-s-cervenou-repou", "gulasova-polevka-z-hlivy-ustricne", "spenatova-polevka"];
const VIEWPORTS = [["mobil", { width: 390, height: 844 }], ["tablet", { width: 820, height: 1180 }], ["pocitac", { width: 1440, height: 900 }]];
const decoded = (src) => decodeURIComponent(new URL(src, BASE).searchParams.get("url") ?? new URL(src, BASE).pathname);

for (const [name, viewport] of VIEWPORTS) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  // katalog
  await page.goto(`${BASE}/kategorie/polevky?t=${Date.now()}`, { waitUntil: "networkidle" });
  const cards = await page.locator("main ul li img, ul.grid li img").evaluateAll((imgs) =>
    imgs.map((i) => ({ src: i.currentSrc || i.src, fit: getComputedStyle(i).objectFit, done: i.complete && i.naturalWidth > 0 }))
  );
  const cardUrls = cards.map((c) => decoded(c.src));
  check(`${name}: katalog — 6 hlavních fotek misek`, SOUPS.every((s) => cardUrls.includes(`/eshop/polevky/${s}-miska.jpg`)), cardUrls.join(", "));
  check(`${name}: katalog — fotky celé (contain) a načtené`, cards.length >= 6 && cards.every((c) => c.fit === "contain" && c.done));
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: katalog bez vodorovného posuvníku`, scrollW <= viewport.width, String(scrollW));
  await page.screenshot({ path: `${OUT}/katalog-${name}.jpg`, type: "jpeg", quality: 72, fullPage: true });

  for (const slug of SOUPS) {
    await page.goto(`${BASE}/produkt/${slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content").catch(() => null);
    if (name === "pocitac") check(`${slug}: náhled při sdílení = miska`, (og ?? "").includes(`/eshop/polevky/${slug}-miska.jpg`), og ?? "-");
    const gallery = page.locator("main .md\\:sticky, div.md\\:sticky").first();
    const main = gallery.locator("img").first();
    const mainInfo = await main.evaluate((i) => ({ src: i.currentSrc || i.src, fit: getComputedStyle(i).objectFit, w: i.naturalWidth, h: i.naturalHeight }));
    check(`${name} ${slug}: hlavní fotka miska`, decoded(mainInfo.src) === `/eshop/polevky/${slug}-miska.jpg`, decoded(mainInfo.src));
    check(`${name} ${slug}: čtverec, celá`, mainInfo.fit === "contain" && mainInfo.w === mainInfo.h, `${mainInfo.w}×${mainInfo.h} ${mainInfo.fit}`);
    const thumbs = gallery.locator("ul button");
    check(`${name} ${slug}: 2 náhledy v galerii`, (await thumbs.count()) === 2, String(await thumbs.count()));
    if (name === "pocitac" || slug === "dynova-polevka") {
      await gallery.screenshot({ path: `${OUT}/${slug}-${name}-1.jpg`, type: "jpeg", quality: 80 });
    }
    await thumbs.nth(1).click();
    await page.waitForTimeout(400);
    const second = decoded(await gallery.locator("img").first().evaluate((i) => i.currentSrc || i.src));
    check(`${name} ${slug}: druhá fotka sáček`, second === `/eshop/polevky/${slug}-sacek.jpg`, second);
    if (name === "pocitac" || slug === "dynova-polevka") {
      await gallery.screenshot({ path: `${OUT}/${slug}-${name}-2.jpg`, type: "jpeg", quality: 80 });
    }
    const body = await page.locator("body").innerText();
    check(`${name} ${slug}: žádná stará fotka`, !(await page.locator(`img[src*="%2Feshop%2F${slug}.jpg"], img[src*="/eshop/${slug}.jpg"]`).count()));
    if (!body) fails.push("prázdná stránka");
  }
  await page.close();
}

// karta kategorie Polévky (posuvný přehled na O nás) — fotka Dýňové, celá
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/o-nas?t=${Date.now()}`, { waitUntil: "networkidle" });
  const tile = page.locator('a[href$="/kategorie/polevky"]').filter({ has: page.locator("img") }).first();
  if (await tile.count()) {
    const info = await tile.locator("img").evaluate((i) => ({ src: i.currentSrc || i.src, fit: getComputedStyle(i).objectFit }));
    check("karta kategorie Polévky = Dýňová, celá", decoded(info.src) === "/eshop/polevky/dynova-polevka-miska.jpg" && info.fit === "contain", `${decoded(info.src)} ${info.fit}`);
    await tile.scrollIntoViewIfNeeded();
    await tile.screenshot({ path: `${OUT}/karta-kategorie-polevky.jpg`, type: "jpeg", quality: 80 });
  } else {
    fails.push("karta kategorie Polévky nenalezena");
  }
  await page.goto(`${BASE}/kategorie/polevky?t=${Date.now()}`, { waitUntil: "networkidle" });
  const og = await page.locator('meta[property="og:image"]').first().getAttribute("content").catch(() => null);
  check("kategorie: náhled při sdílení = Dýňová", (og ?? "").includes("/eshop/polevky/dynova-polevka-miska.jpg"), og ?? "-");
  await page.close();
}

await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) {
  console.log(fails.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

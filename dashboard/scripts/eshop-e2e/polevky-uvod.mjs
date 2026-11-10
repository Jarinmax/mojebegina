// ESHOP — text kategorie Polévky a odstranění „přirozeně bezlepková“
// (10. 11. 2026). Mobil i počítač: 3 odstavce pod nadpisem, stejná šířka
// a formát jako u Sirupů, žádné tvrzení o lepku, žádné veřejné „Ověřujeme“.
// Spuštění jako polevka-info.mjs; BASE=https://begina.cz pro ostrý web.
import { mkdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/hero";
const BASE = process.env.BASE ?? `http://begina.cz:${PORT}`;
const EXPECT_NEW = process.env.EXPECT_NEW !== "0"; // 0 = jen zjistit stav (před skriptem 83)
mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch(process.env.BASE ? {} : { args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });
const SOUPS = ["dynova-polevka", "kulajda", "rajcatova-polevka", "rajcatova-polevka-s-cervenou-repou", "gulasova-polevka-z-hlivy-ustricne", "spenatova-polevka"];

const introOf = (page) =>
  page.locator("h1 + p").first().evaluate((p) => {
    const section = p.parentElement;
    const ps = [...section.querySelectorAll(":scope > p")];
    return { width: Math.round(section.getBoundingClientRect().width), texts: ps.map((x) => x.textContent), weights: ps.map((x) => getComputedStyle(x).fontWeight), colors: ps.map((x) => getComputedStyle(x).color) };
  }).catch(() => null);

for (const [name, viewport] of [["mobil", { width: 390, height: 844 }], ["pocitac", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/kategorie/sirupy`, { waitUntil: "networkidle" });
  const syr = await introOf(page);
  await page.goto(`${BASE}/kategorie/polevky?t=${Date.now()}`, { waitUntil: "networkidle" });
  const soup = await introOf(page);
  const texts = soup?.texts ?? [];
  console.log(`${name}: polévky odstavců ${texts.length}; ${texts[0]?.slice(0, 60) ?? "-"}`);
  if (EXPECT_NEW) {
    check(`${name}: 3 odstavce`, texts.length === 3, String(texts.length));
    check(`${name}: 1. odstavec`, /^Čerstvé polévky Begina vaříme z čisté filtrované vody/.test(texts[0] ?? ""), texts[0] ?? "");
    check(`${name}: poslední věta`, /Méně času u plotny, více času pro Vás\.$/.test(texts[2] ?? ""), texts[2] ?? "");
    check(`${name}: šířka jako sirupy`, syr && soup && syr.width === soup.width, `${syr?.width} / ${soup?.width}`);
    check(`${name}: formát jako sirupy`, syr && JSON.stringify(syr.weights) === JSON.stringify(soup.weights) && JSON.stringify(syr.colors) === JSON.stringify(soup.colors), `${syr?.weights} / ${soup?.weights}`);
  }
  const body = await page.locator("body").innerText();
  check(`${name}: kategorie bez tvrzení o lepku`, !/bezlepk|bez lepku/i.test(body));
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: bez vodorovného posuvníku`, scrollW <= viewport.width, String(scrollW));
  await page.screenshot({ path: `${OUT}/polevky-uvod-${name}.jpg`, type: "jpeg", quality: 75 });
  if (name === "pocitac") {
    for (const slug of SOUPS) {
      await page.goto(`${BASE}/produkt/${slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
      const t = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
      const lepek = /bezlepk|bez lepku/i.test(t);
      console.log(`  ${slug}: ${lepek ? "OBSAHUJE „přirozeně bezlepková“" : "bez tvrzení o lepku"}`);
      if (EXPECT_NEW) check(`${slug}: bez tvrzení o lepku`, !lepek);
      check(`${slug}: bez „Ověřujeme“ / „bez alergenů“`, !/Ověřujeme|bez alergenů|Neobsahuje žádný z alergenů/.test(t));
    }
  }
  await page.close();
}
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) {
  console.log(fails.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

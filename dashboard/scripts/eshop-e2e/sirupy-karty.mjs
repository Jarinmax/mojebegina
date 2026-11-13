// ESHOP — karty sirupů (11. 11. 2026): cena každého balení zvlášť
// („199 Kč / 650 ml“, „549 Kč / 3 l“), počty nápojů podle balení, bez „od 199“.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const BASE = process.env.BASE ?? `http://begina.cz:${PORT}`;
const fails = [];
const ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch(process.env.BASE ? {} : { args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });
for (const [name, viewport] of [["mobil", { width: 390, height: 844 }], ["pocitac", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${BASE}/kategorie/sirupy?t=${Date.now()}`, { waitUntil: "networkidle" });
  const body = await page.locator("main").innerText();
  check(`${name}: ceny po baleních`, (body.match(/199 Kč \/ 650 ml/g) ?? []).length === 7 && (body.match(/Kč \/ 3 l/g) ?? []).length === 7);
  check(`${name}: bez „od 199 Kč“`, !/od 199/.test(body));
  check(`${name}: počty nápojů podle balení`, (body.match(/650 ml: až 32 nápojů/g) ?? []).length === 7);
  check(`${name}: bez „z jednoho balení“`, !/z jednoho balení/.test(body));
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: bez vodorovného posuvníku`, w <= viewport.width, String(w));
  await page.goto(`${BASE}/produkt/lipovy-sirup?t=${Date.now()}`, { waitUntil: "networkidle" });
  const d = await page.locator("main").innerText();
  check(`${name}: detail — výhoda z balení 3 l a Zlaté pravidlo`, /až 150 nápojů z balení 3 l/.test(d) && /20 ml sirupu a doplňte vodou na 200 ml nápoje/.test(d));
  await page.close();
}
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) { console.log(fails.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

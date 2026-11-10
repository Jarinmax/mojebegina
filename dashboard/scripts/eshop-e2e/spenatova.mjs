// ESHOP — Špenátová polévka: nové složení a výživa (10. 11. 2026), mobil
// i počítač; žádná interní poznámka o výpočtu na webu. BASE= pro ostrý web.
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
const norm = (t) => (t ?? "").replaceAll(" ", " ").trim();
for (const [name, viewport] of [["mobil", { width: 390, height: 844 }], ["pocitac", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/produkt/spenatova-polevka?t=${Date.now()}`, { waitUntil: "networkidle" });
  const section = page.locator("section[aria-labelledby=food-info]");
  const ing = norm(await section.locator("dt:text-is('Složení') + dd").textContent());
  const nut = norm(await section.locator("dt").filter({ hasText: /Výživ/ }).locator("xpath=following-sibling::dd[1]").first().textContent());
  console.log(`${name}: Složení: ${ing}\n${name}: Výživa: ${nut}`);
  check(`${name}: složení`, ing === "Čistá filtrovaná voda, špenát 17 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 14 %, cibule, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C).", ing);
  check(`${name}: výživa 199 kJ / 48 kcal … sůl 0,76 g`, /199 kJ \/ 48 kcal/.test(nut) && /tuky 3,4 g/.test(nut) && /nasycené 2,4 g/.test(nut) && /sacharidy 2,7 g/.test(nut) && /cukry 0,7 g/.test(nut) && /bílkoviny 1,1 g/.test(nut) && /sůl 0,76 g/.test(nut) && !/vláknina/.test(nut), nut);
  const body = await page.locator("body").innerText();
  check(`${name}: žádná interní poznámka`, !/kalkulace|xlsx|výpočtov|průměrné hodnoty olej/i.test(body));
  check(`${name}: žádné staré údaje`, !/210 kJ|kokosové mléko 15 %|brambory 13 %|cibule 4 %/.test(body));
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: `${OUT}/spenatova-info-${name}.jpg`, type: "jpeg", quality: 80 });
  await page.close();
}
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) {
  console.log(fails.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

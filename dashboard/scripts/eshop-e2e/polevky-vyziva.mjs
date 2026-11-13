// ESHOP — Kulajda, Špenátová, Tomatová: nové složení a výživa jako tabulka
// (10. 11. 2026). Mobil i počítač, bez vodorovného posouvání, čísla
// zarovnaná doprava, žádná interní poznámka. BASE= pro ostrý web.
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
const EXPECT = {
  kulajda: {
    ing: "Čistá filtrovaná voda, brambory 22 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), žampiony 7 %, cibule 5 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, antioxidant: kyselina askorbová (vitamin C).",
    rows: ["Energetická hodnota|219 kJ / 53 kcal", "Tuky|3,5 g", "z toho nasycené mastné kyseliny|2,4 g", "Sacharidy|3,9 g", "z toho cukry|0,8 g", "Bílkoviny|1,0 g", "Sůl|0,76 g"],
  },
  "spenatova-polevka": {
    ing: "Čistá filtrovaná voda, špenát 17 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 14 %, cibule 4 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C).",
    rows: ["Energetická hodnota|199 kJ / 48 kcal", "Tuky|3,4 g", "z toho nasycené mastné kyseliny|2,4 g", "Sacharidy|2,7 g", "z toho cukry|0,7 g", "Bílkoviny|1,1 g", "Sůl|0,76 g"],
  },
  "rajcatova-polevka": {
    ing: "Čistá filtrovaná voda, pasírovaná rajčata 27 % (rajčata 99,9 %, regulátor kyselosti: kyselina citronová), rajčatový protlak 7 % (rajčatový protlak, jedlá sůl 1 %), brambory 7 %, kokosové mléko 6 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), cibule 5 %, kořen petržele, olivový olej, třtinový cukr, mořská sůl, česnek, libeček, černý pepř, kardamom, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma.",
    rows: ["Energetická hodnota|229 kJ / 54 kcal", "Tuky|2,9 g", "z toho nasycené mastné kyseliny|1,3 g", "Sacharidy|5,5 g", "z toho cukry|4,4 g", "Bílkoviny|1,2 g", "Sůl|0,86 g"],
  },
};
for (const [name, viewport] of [["mobil", { width: 390, height: 844 }], ["pocitac", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  for (const [slug, exp] of Object.entries(EXPECT)) {
    await page.goto(`${BASE}/produkt/${slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
    const section = page.locator("section[aria-labelledby=food-info]");
    const ing = norm(await section.locator("dt:text-is('Složení') + dd").textContent());
    check(`${name} ${slug}: složení`, ing === exp.ing, ing);
    const table = section.locator("table");
    const has = (await table.count()) === 1;
    check(`${name} ${slug}: výživa jako tabulka`, has);
    if (has) {
      const rows = await table.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.replaceAll(" ", " ").trim()).join("|")));
      check(`${name} ${slug}: hodnoty`, JSON.stringify(rows) === JSON.stringify(exp.rows), rows.join(" ; "));
      const align = await table.locator("tbody td").evaluateAll((tds) => tds.every((td) => getComputedStyle(td).textAlign === "right"));
      check(`${name} ${slug}: čísla doprava`, align);
      const head = norm(await table.locator("thead").textContent());
      check(`${name} ${slug}: záhlaví na 100 ml`, /na 100 ml/.test(head), head);
      const tw = await table.evaluate((t) => [t.scrollWidth, t.parentElement.clientWidth]);
      check(`${name} ${slug}: tabulka se vejde`, tw[0] <= tw[1], tw.join("/"));
    }
    const body = await page.locator("body").innerText();
    check(`${name} ${slug}: bez interních poznámek a vlákniny`, !/kalkulace|xlsx|výpočtov|bazalka|vláknina|2 915|3 015/i.test(await section.innerText()));
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${name} ${slug}: bez vodorovného posuvníku`, scrollW <= viewport.width, String(scrollW));
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: `${OUT}/${slug}-info-${name}.jpg`, type: "jpeg", quality: 80 });
  }
  // ostatní polévky beze změny (text)
  await page.goto(`${BASE}/produkt/dynova-polevka?t=${Date.now()}`, { waitUntil: "networkidle" });
  check(`${name}: Dýňová tabulka bez vlákniny`, (await page.locator("section[aria-labelledby=food-info] table tbody tr").count()) === 7);
  await page.close();
}
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) {
  console.log(fails.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

// ESHOP — vzhled „Informace o potravině“ u všech produktů (10. 11. 2026):
// mobil = název nad textem přes celou šířku; tablet/počítač = název vlevo,
// obsah vpravo; výživa jako tabulka přes celou šířku bez samostatného
// nadpisu; žádné vodorovné posouvání, oříznutí ani překrývání.
// BASE=https://begina.cz pro ostrý web.
import { mkdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/hero";
const BASE = process.env.BASE ?? `http://begina.cz:${PORT}`;
const SHOTS = (process.env.SHOTS ?? "gulasova-polevka-z-hlivy-ustricne,dynova-polevka,lipovy-caj,granatovy-bond,svarak-deluxe").split(",");
mkdirSync(OUT, { recursive: true });
const fails = [];
let okCount = 0;
const check = (n, c, d = "") => (c ? okCount++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const browser = await chromium.launch(process.env.BASE ? {} : { args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });

// seznam produktů z kategorií
const slugs = new Set();
{
  const page = await browser.newPage();
  for (const cat of ["polevky", "sirupy", "caje", "ovocne-napoje", "koktejly", "zmrzliny"]) {
    const res = await page.goto(`${BASE}/kategorie/${cat}`, { waitUntil: "networkidle" });
    if (!res || res.status() >= 400) continue;
    for (const href of await page.locator('a[href*="/produkt/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")))) {
      const m = /\/produkt\/([^/?#]+)/.exec(href ?? "");
      if (m) slugs.add(m[1]);
    }
  }
  await page.close();
}
console.log(`produktů: ${slugs.size}`);
const stats = { tabulka: 0, bezTabulky: [] };

for (const [name, viewport] of [["mobil", { width: 390, height: 844 }], ["tablet", { width: 820, height: 1180 }], ["pocitac", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  for (const slug of slugs) {
    await page.goto(`${BASE}/produkt/${slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
    const section = page.locator("section[aria-labelledby=food-info]");
    if (!(await section.count())) { fails.push(`${name} ${slug}: chybí sekce`); continue; }
    const r = await section.evaluate((sec, vw) => {
      const out = { problems: [], table: false, rows: 0, nutritionTextRow: false, visibleNutritionDt: false };
      const secBox = sec.getBoundingClientRect();
      if (sec.scrollWidth > sec.clientWidth + 1) out.problems.push(`sekce přetéká ${sec.scrollWidth}/${sec.clientWidth}`);
      if (document.documentElement.scrollWidth > vw) out.problems.push(`stránka ${document.documentElement.scrollWidth}`);
      const items = [...sec.querySelectorAll("dl > div")];
      let prevBottom = -Infinity;
      for (const it of items) {
        const dt = it.querySelector("dt"); const dd = it.querySelector("dd");
        const b = it.getBoundingClientRect();
        if (b.top < prevBottom - 1) out.problems.push(`řádek „${dt.textContent}“ překrývá předchozí`);
        prevBottom = b.bottom;
        if (dd.scrollWidth > dd.clientWidth + 1) out.problems.push(`„${dt.textContent}“ oříznuté/přetéká`);
        if (b.right > secBox.right + 1) out.problems.push(`„${dt.textContent}“ za okrajem`);
        const table = dd.querySelector("table");
        if (table) {
          out.table = true;
          out.rows = table.querySelectorAll("tbody tr").length;
          const dtVisible = getComputedStyle(dt).position !== "absolute" && dt.getBoundingClientRect().width > 2;
          if (dtVisible) out.visibleNutritionDt = true;
          if (Math.abs(table.getBoundingClientRect().width - secBox.width) > 2) out.problems.push(`tabulka není přes celou šířku (${Math.round(table.getBoundingClientRect().width)}/${Math.round(secBox.width)})`);
          for (const td of table.querySelectorAll("tbody td")) if (getComputedStyle(td).textAlign !== "right") out.problems.push("hodnota není vpravo");
          const head = table.querySelector("thead").textContent.replace(/ /g, " ");
          if (!/^Průměrné výživové hodnoty/.test(head) || !/na 100 (ml|g)$/.test(head)) out.problems.push(`záhlaví „${head}“`);
          for (const th of table.querySelectorAll("tbody th")) {
            if (/^z toho/.test(th.textContent) && parseFloat(getComputedStyle(th).paddingLeft) < 8) out.problems.push("podřádek není odsazený");
          }
          continue;
        }
        if (dt.textContent === "Výživové hodnoty") out.nutritionTextRow = true;
        const dtB = dt.getBoundingClientRect(); const ddB = dd.getBoundingClientRect();
        if (vw < 640) {
          if (!(dtB.bottom <= ddB.top + 1)) out.problems.push(`mobil: „${dt.textContent}“ není nad textem`);
          if (Math.abs(ddB.width - secBox.width) > 2) out.problems.push(`mobil: text „${dt.textContent}“ není přes celou šířku (${Math.round(ddB.width)}/${Math.round(secBox.width)})`);
        } else if (!(dtB.right <= ddB.left + 1 && Math.abs(dtB.top - ddB.top) < 3)) {
          out.problems.push(`„${dt.textContent}“ není vlevo vedle obsahu`);
        }
      }
      return out;
    }, viewport.width);
    check(`${name} ${slug}: rozložení`, r.problems.length === 0, r.problems.join("; "));
    check(`${name} ${slug}: bez samostatného nadpisu nad tabulkou`, !r.visibleNutritionDt);
    if (name === "pocitac") {
      if (r.table) stats.tabulka++;
      else stats.bezTabulky.push(`${slug}${r.nutritionTextRow ? " (výživa textem!)" : ""}`);
      check(`${slug}: žádná výživa jako odstavec`, !r.nutritionTextRow || !r.table);
      if (r.table) check(`${slug}: 7–8 řádků tabulky`, r.rows === 7 || r.rows === 8, String(r.rows));
    }
    if (SHOTS.includes(slug)) {
      await section.scrollIntoViewIfNeeded();
      await page.evaluate(() => { const h = document.querySelector("header"); if (h) h.style.visibility = "hidden"; });
      await section.screenshot({ path: `${OUT}/potravina-${slug}-${name}.jpg`, type: "jpeg", quality: 78 });
    }
  }
  await page.close();
}
await browser.close();
console.log(`s tabulkou: ${stats.tabulka}; bez tabulky: ${stats.bezTabulky.join(", ") || "-"}`);
console.log(`✓ ${okCount} kontrol`);
if (fails.length) {
  console.log(fails.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

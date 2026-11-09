// begina.cz — typografie tabulky „Informace o potravině“ u všech produktů
// (10. 11. 2026): složení a věty velkým písmenem s tečkou, výživa „Na 100 …:“
// s tečkou, samostatné hodnoty bez tečky, „E 435“ pohromadě. Počítač a mobil.
import { mkdirSync } from "node:fs";
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/typo";
mkdirSync(OUT, { recursive: true });
const fails = [], ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });
const url = (p) => `http://begina.cz:${PORT}${p}`;
const SENTENCE = ["Složení", "Alergeny", "Výživové hodnoty", "Skladování", "Trvanlivost", "Příprava", "Vrácení a reklamace"];
for (const [name, device] of [["pocitac", { viewport: { width: 1440, height: 900 } }], ["mobil", devices["iPhone 13"]]]) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const vw = page.viewportSize().width;
  // všechny produkty z kategorií
  const slugs = new Set();
  for (const cat of ["polevky", "sirupy", "caje", "ovocne-napoje", "koktejly"]) {
    await page.goto(url(`/kategorie/${cat}`), { waitUntil: "load" });
    for (const h of await page.locator('main a[href^="/produkt/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")))) slugs.add(h);
  }
  check(`${name}: produkty nalezené`, slugs.size >= 20, String(slugs.size));
  let problems = [];
  for (const href of slugs) {
    await page.goto(url(href), { waitUntil: "load" });
    const rows = await page.locator("section[aria-labelledby=food-info] dl > div").evaluateAll((divs) =>
      divs.map((d) => ({ dt: d.querySelector("dt").textContent, dd: d.querySelector("dd").textContent.trim(), missing: d.querySelector("dd").className.includes("italic") }))
    );
    for (const r of rows) {
      if (/[.:]$/.test(r.dt)) problems.push(`${href} název řádku „${r.dt}“`);
      if (r.missing || r.dd === "Ověřujeme") continue;
      if (SENTENCE.includes(r.dt)) {
        if (!/^\p{Lu}/u.test(r.dd)) problems.push(`${href} ${r.dt}: malé písmeno`);
        if (!/[.!?]$/.test(r.dd)) problems.push(`${href} ${r.dt}: bez tečky`);
        if (/\.\.$/.test(r.dd)) problems.push(`${href} ${r.dt}: dvě tečky`);
      }
      if (r.dt === "Výživové hodnoty" && !/^Na 100 (ml|g): /.test(r.dd)) problems.push(`${href} výživa nezačíná „Na 100 …:“`);
      if (r.dt === "Balení" && /\.$/.test(r.dd)) problems.push(`${href} balení s tečkou`);
      if (r.dt === "Obsah alkoholu" && !/^\d+(,\d+)?\u00a0% obj\.$/.test(r.dd)) problems.push(`${href} alkohol „${r.dd}“`);
      if (/E 435/.test(r.dd)) problems.push(`${href} E 435 bez nezalomitelné mezery`);
      if (/\d %/.test(r.dd)) problems.push(`${href} ${r.dt}: obyčejná mezera před %`);
    }
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > vw) problems.push(`${href} přetéká ${sw}/${vw}`);
    // 10. 11. 2026: žádné nepodložené „Neobsahuje žádný z alergenů…“
    const main = await page.locator("main").innerText();
    if (/Neobsahuje žádný|povinně uvádějí|bez alergenů/i.test(main)) problems.push(`${href} tvrzení o nepřítomnosti alergenů`);
    const al = rows.find((r) => r.dt === "Alergeny");
    if (href.endsWith("/svarak-deluxe") && !(al && /siřičit/i.test(al.dd))) problems.push(`${href} chybí skutečný alergen (siřičitany)`);
  }
  check(`${name}: typografie u ${slugs.size} produktů`, problems.length === 0, problems.slice(0, 15).join(" ‖ "));
  for (const href of ["/produkt/dynova-polevka", "/produkt/svarak-deluxe"]) {
    await page.goto(url(href), { waitUntil: "load" });
    const sec = page.locator("section[aria-labelledby=food-info]");
    await sec.scrollIntoViewIfNeeded();
    await sec.screenshot({ path: `${OUT}${href.replace("/produkt", "")}-${name}.jpg`, type: "jpeg", quality: 70 });
  }
  await ctx.close();
}
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) { console.log(fails.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

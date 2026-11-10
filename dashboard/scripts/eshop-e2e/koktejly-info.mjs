// ESHOP — koktejly: vypíše „Informace o potravině“ (mobil + počítač) pro
// porovnání před/po; EXPECT_NO_NUTRITION=1 ověří, že u tří koktejlů bez
// výživy řádek „Výživové hodnoty“ není a „Doplníme“ u výživy nikde.
// BASE=https://begina.cz.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const BASE = process.env.BASE ?? "https://begina.cz";
const OUT = process.env.OUT_DIR ?? "/tmp/hero";
const browser = await chromium.launch();
const fails = [];
for (const [name, viewport] of [["mobil", { width: 390, height: 844 }], ["pocitac", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport });
  for (const slug of ["granatovy-bond", "kosmopolitan", "lady-carneval", "svarak-deluxe"]) {
    await page.goto(`${BASE}/produkt/${slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
    const sec = page.locator("section[aria-labelledby=food-info]");
    const rows = await sec.locator("dl > div").evaluateAll((ds) =>
      ds.map((d) => `${d.querySelector("dt").textContent}: ${d.querySelector("dd").textContent.replace(/\s+/g, " ").trim()}`)
    );
    const extra = await sec.locator(":scope > p").allTextContents();
    console.log(`#${name}|${slug}|${JSON.stringify([...rows, ...extra.map((t) => `P: ${t}`)])}`);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollW > viewport.width) fails.push(`${name} ${slug}: posouvání ${scrollW}`);
    if (process.env.EXPECT_NO_NUTRITION && slug !== "svarak-deluxe") {
      if (rows.some((r) => r.startsWith("Výživové hodnoty"))) fails.push(`${name} ${slug}: řádek Výživové hodnoty stále je`);
      const main = await page.locator("main").innerText();
      if (/Výživové hodnoty|výživ\w* údaj/i.test(main)) fails.push(`${name} ${slug}: zmínka o výživě jinde v detailu`);
    }
    if (process.env.EXPECT_NO_NUTRITION && slug === "svarak-deluxe" && !(await sec.locator("table").count())) fails.push(`${name} svařák: chybí tabulka`);
    await sec.scrollIntoViewIfNeeded();
    await page.evaluate(() => { const h = document.querySelector("header"); if (h) h.style.visibility = "hidden"; });
    await sec.screenshot({ path: `${OUT}/koktejl-${slug}-${name}.jpg`, type: "jpeg", quality: 78 });
  }
  await page.close();
}
await browser.close();
if (fails.length) { console.log(fails.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }
console.log("✓ koktejly OK");

// begina.cz (9. 11. 2026): podnabídka „O nás“ (Náš příběh, O vodě, O balení)
// myší, klávesnicí i dotykem; stránky O nás / O vodě / O balení (texty, bez
// řádku Provozovatel, kolotoč šesti kategorií); část Balení u produktů
// („3 l – …“, „700 ml – …“, „500 ml – …“, odkaz Více o balení); označení
// variant jen objemem. Počítač, iPad, mobil na výšku i na šířku.
import { mkdirSync } from "node:fs";
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/onas";
mkdirSync(OUT, { recursive: true });
const fails = [], ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });
const url = (p) => `http://begina.cz:${PORT}${p}`;
const ABOUT = [["Náš příběh", "/o-nas", "O nás"], ["O vodě", "/o-vode", "Čistá filtrovaná voda"], ["O balení", "/o-baleni", "O balení"]];
const CASES = [
  ["pocitac", { viewport: { width: 1440, height: 900 } }],
  ["notebook-1280", { viewport: { width: 1280, height: 720 } }],
  ["ipad-vysku", devices["iPad (gen 7)"]],
  ["ipad-sirku", devices["iPad (gen 7) landscape"]],
  ["iphone-vysku", devices["iPhone 13"]],
  ["iphone-sirku", devices["iPhone 13 landscape"]],
];
const T3 = "praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.";
const PRODUCTS = [
  ["dynova-polevka", [["3 l", T3]]],
  ["lipovy-sirup", [["3 l", `${T3} Dodáváme v kartonové krabici.`], ["700 ml", "lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu."]]],
  ["svarak-deluxe", [["3 l", T3], ["500 ml", "lehké balení v průhledném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu."]]],
  ["lipovy-caj", [["3 l", T3]]],
];
for (const [name, device] of CASES) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const vw = page.viewportSize().width;
  const desktop = vw >= 1280;
  await page.goto(url("/"), { waitUntil: "networkidle" });
  if (desktop) {
    const nav = page.locator('header nav[aria-label="Hlavní menu"]');
    const top = (await nav.locator(":scope > ul > li > a, :scope > ul > li > button").allInnerTexts()).map((s) => s.trim());
    check(`${name}: hlavní lišta bez samostatného O vodě`, !top.includes("O vodě") && top.includes("O nás") && top.indexOf("O nás") < top.indexOf("MojeBegina"), top.join(" | "));
    const btn = nav.getByRole("button", { name: "O nás" });
    // myš
    await btn.hover();
    const items = (await nav.locator('li:has(> button:text-is("O nás")) ul a').allInnerTexts()).map((s) => s.trim());
    check(`${name}: myš — podnabídka O nás`, items.join("|") === ABOUT.map((a) => a[0]).join("|") && (await nav.getByRole("link", { name: "O balení" }).isVisible()), items.join(" | "));
    await page.mouse.move(5, 600);
    await page.waitForTimeout(150);
    check(`${name}: myš — odjetí zavře`, !(await nav.getByRole("link", { name: "O balení" }).isVisible()));
    // klávesnice
    await btn.focus();
    await page.keyboard.press("Enter");
    check(`${name}: klávesnice — Enter otevře`, (await btn.getAttribute("aria-expanded")) === "true" && (await nav.getByRole("link", { name: "Náš příběh" }).isVisible()));
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    check(`${name}: klávesnice — Tab do podnabídky`, focused === "Náš příběh", focused);
    await page.keyboard.press("Escape");
    const back = await page.evaluate(() => document.activeElement?.textContent?.trim());
    check(`${name}: klávesnice — Esc zavře a vrátí fokus`, (await btn.getAttribute("aria-expanded")) === "false" && back === "O nás", back);
    for (const [label, path, h1] of ABOUT) {
      await page.goto(url("/"), { waitUntil: "networkidle" });
      await btn.click();
      await Promise.all([page.waitForURL(url(path)), nav.getByRole("link", { name: label, exact: true }).click()]);
      check(`${name}: ${label} → ${path}`, (await page.locator("h1").first().textContent()).trim() === h1);
    }
    const n2 = await nav.getByRole("button", { name: "Nápoje" }).count();
    check(`${name}: Nápoje dál funguje`, n2 === 1);
  } else {
    await page.getByRole("button", { name: "Otevřít menu" }).tap();
    const panel = page.locator('header nav[aria-label="Menu"]');
    await panel.getByRole("button", { name: "O nás" }).tap();
    const items = (await panel.locator('li:has(> button:text-is("O nás")) ul a').allInnerTexts()).map((s) => s.trim());
    check(`${name}: dotyk — podnabídka O nás v menu ☰`, items.join("|") === ABOUT.map((a) => a[0]).join("|"), items.join(" | "));
    check(`${name}: menu ☰ bez samostatného O vodě nahoře`, !(await panel.locator(':scope > ul > li > a:text-is("O vodě")').count()));
    await panel.getByRole("button", { name: "Nápoje" }).tap();
    check(`${name}: otevřením Nápojů se O nás zavře`, !(await panel.getByRole("link", { name: "O balení" }).isVisible()));
    await page.screenshot({ path: `${OUT}/menu-${name}.jpg`, type: "jpeg", quality: 65 });
    for (const [label, path, h1] of ABOUT) {
      await page.goto(url("/"), { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Otevřít menu" }).tap();
      await panel.getByRole("button", { name: "O nás" }).tap();
      const link = panel.getByRole("link", { name: label, exact: true });
      await link.scrollIntoViewIfNeeded();
      await Promise.all([page.waitForURL(url(path)), link.tap()]);
      check(`${name}: ${label} → ${path}`, (await page.locator("h1").first().textContent()).trim() === h1);
    }
  }
  // stránky O nás / O vodě / O balení
  for (const [, path] of ABOUT) {
    await page.goto(url(path), { waitUntil: "networkidle" });
    const text = await page.locator("main").innerText();
    check(`${name} ${path}: bez řádku Provozovatel v obsahu`, !/Provozovatel:/.test(text));
    const tiles = await page.locator('main [aria-roledescription="carousel"] a[href^="/kategorie/"], main section a[href^="/kategorie/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
    if (path !== "/o-baleni" || tiles.length) check(`${name} ${path}: kolotoč všech šesti kategorií`, ["polevky", "sirupy", "caje", "ovocne-napoje", "koktejly", "zmrzliny"].every((s) => tiles.includes(`/kategorie/${s}`)), tiles.join(" "));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${name} ${path}: bez vodorovného přetékání`, sw <= vw, `${sw}/${vw}`);
    if (path === "/o-baleni") check(`${name} ${path}: text O balení`, /Našemu třílitrovému balení s kohoutkem říkáme Begina\./.test(text) && !/bagina/i.test(text));
    await page.screenshot({ path: `${OUT}/${path.slice(1)}-${name}.jpg`, type: "jpeg", quality: 60, fullPage: true });
  }
  // Balení u produktů
  for (const [slug, expected] of PRODUCTS) {
    await page.goto(url(`/produkt/${slug}`), { waitUntil: "networkidle" });
    const sec = page.locator('section:has(> h2:text-is("Balení"))');
    const lis = await sec.locator("li").evaluateAll((els) => els.map((li) => ({ bold: li.querySelector("strong")?.textContent, text: li.textContent })));
    const okList = lis.length === expected.length && expected.every(([v, t], i) => lis[i].bold === v && lis[i].text === `${v} – ${t}`);
    check(`${name} ${slug}: část Balení`, okList, lis.map((l) => l.text).join(" ‖ "));
    const more = sec.getByRole("link", { name: "Více o balení" });
    check(`${name} ${slug}: odkaz Více o balení`, (await more.getAttribute("href")) === "/o-baleni");
    const dd = (await page.locator("section[aria-labelledby=food-info] dt:text-is('Balení') + dd").textContent()).trim();
    check(`${name} ${slug}: Informace o potravině — jen objemy`, dd === expected.map((e) => e[0]).join(", "), dd);
    const body = await page.locator("main").innerText();
    check(`${name} ${slug}: žádné Begina 3 l / 750`, !/Begina 3 l|750 g|750 ml/.test(body));
    if (slug === "lipovy-sirup") check(`${name} ${slug}: Zlaté pravidlo zpět v popisu`, /Zlaté pravidlo Beginy: doporučený poměr ředění je 1 : 10\./.test(body) && /20 ml sirupu na 200 ml vody/.test(body));
    if (slug === "lipovy-sirup" && name === "pocitac") {
      await Promise.all([page.waitForURL(url("/o-baleni")), more.click()]);
      check(`${name}: klik Více o balení → O balení`, (await page.locator("h1").first().textContent()).trim() === "O balení");
    }
  }
  await page.goto(url("/produkt/lipovy-sirup"), { waitUntil: "networkidle" });
  await page.locator('section:has(> h2:text-is("Balení"))').scrollIntoViewIfNeeded();
  await page.locator('section:has(> h2:text-is("Balení"))').screenshot({ path: `${OUT}/baleni-${name}.jpg`, type: "jpeg", quality: 70 });
  await ctx.close();
}
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) { console.log(fails.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

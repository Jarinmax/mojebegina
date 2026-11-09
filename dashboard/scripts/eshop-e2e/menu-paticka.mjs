// begina.cz — nadpis úvodu, mobilní menu ☰ a patička (zadání majitele
// 9. 11. 2026) v prohlížeči nad sestavenou aplikací (next start + testovací
// DB neon-http-pglite.mjs). Snímky do OUT_DIR (výchozí /tmp/menu).
//   node scripts/eshop-e2e/menu-paticka.mjs 3100
import { mkdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/menu";
mkdirSync(OUT, { recursive: true });
const failures = [];
const passed = [];
const check = (name, ok, detail = "") => (ok ? passed : failures).push(`${name}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1`] });
const url = (p) => `http://begina.cz:${PORT}${p}`;
const VIEWPORTS = [
  ["mobil", { width: 390, height: 844 }],
  ["mobil-maly", { width: 360, height: 560 }],
  ["tablet", { width: 820, height: 1180 }],
  ["tablet-na-sirku", { width: 1024, height: 768 }],
  ["pocitac", { width: 1440, height: 900 }],
];
const PAGES = ["/", "/kategorie/polevky", "/kategorie/sirupy", "/o-nas", "/o-vode", "/doprava", "/obchodni-podminky", "/kosik"];
const MENU = ["Čerstvé polévky", "Bylinné sirupy", "Nápoje", "Zmrzliny", "O nás", "O vodě", "MojeBegina"];
const DRINKS = ["Čaje", "Ovocné nápoje", "Alkoholické koktejly"];

// první produkt pro kontrolu stránky produktu
{
  const p = await browser.newPage();
  await p.goto(url("/kategorie/polevky"), { waitUntil: "networkidle" });
  const href = await p.locator('a[href^="/produkt/"]').first().getAttribute("href").catch(() => null);
  if (href) PAGES.push(href);
  await p.close();
}

for (const [name, viewport] of VIEWPORTS) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: name.startsWith("mobil") ? 2 : 1, hasTouch: name !== "pocitac" });
  const mobileMenu = viewport.width < 1280;

  // --- nadpis úvodu
  await page.goto(url("/"), { waitUntil: "networkidle" });
  const h1 = page.locator("h1");
  const text = (await h1.textContent()).replace(/ /g, " ");
  check(`${name}: text nadpisu`, text === "Čerstvé polévky Bylinné sirupy Nápoje a zmrzliny", text);
  const hb = await h1.boundingBox();
  const lines = await h1.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
    return { lines: tops.size, fs: parseFloat(getComputedStyle(el).fontSize), align: getComputedStyle(el).textAlign };
  });
  check(`${name}: nadpis 1–3 řádky, rozumná velikost`, lines.lines === 3 && lines.fs >= 24 && lines.fs <= 48, `${lines.lines} ř., ${lines.fs}px`);
  if (viewport.width < 1024) {
    const center = hb.x + hb.width / 2;
    check(`${name}: nadpis na střed`, lines.align === "center" && Math.abs(center - viewport.width / 2) < 4, `střed ${center} / ${viewport.width / 2}`);
  }
  const body = await page.evaluate(() => document.body.innerText);
  check(`${name}: žádné osamocené srdíčko`, !/(^|\n)\s*[♥❤♡💚🤍]\s*(\n|$)/u.test(body), /[♥❤♡]/u.test(body) ? "srdíčko na stránce je" : "na stránce žádné srdíčko");
  await page.screenshot({ path: `${OUT}/uvod-${name}.jpg`, type: "jpeg", quality: 70 });

  // --- bez vodorovného přetékání na všech stránkách + patička
  for (const p of PAGES) {
    await page.goto(url(p), { waitUntil: "networkidle" });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${name} ${p}: bez vodorovného přetékání`, sw <= viewport.width, `scrollWidth ${sw}`);
    const order = await page.locator("footer section h2").allTextContents();
    check(`${name} ${p}: patička v pořadí`, order.join("|") === "Provozovna a osobní odběr|Kontakt|Provozovatel a fakturační údaje", order.join("|"));
  }

  // rozložení patičky
  await page.goto(url("/"), { waitUntil: "networkidle" });
  const boxes = await page.locator("footer section").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y })));
  if (viewport.width >= 1024) check(`${name}: patička vedle sebe zleva doprava`, boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x && Math.abs(boxes[0].y - boxes[2].y) < 2, JSON.stringify(boxes));
  else check(`${name}: patička pod sebou`, boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y, JSON.stringify(boxes));
  const tel = page.locator('footer a[href^="tel:"]');
  const mail = page.locator('footer a[href^="mailto:"]');
  const map = page.getByRole("link", { name: "Zobrazit na mapě" });
  check(`${name}: telefon klikací`, (await tel.getAttribute("href")) === "tel:+420774199975" && (await tel.isVisible()));
  check(`${name}: e-mail klikací`, (await mail.getAttribute("href")) === "mailto:info@begina.cz" && (await mail.isVisible()));
  check(`${name}: telefon/e-mail jen jednou v patičce`, (await tel.count()) === 1 && (await mail.count()) === 1);
  const mapHref = await map.getAttribute("href");
  check(`${name}: mapa otevře Google Mapy v novém okně`, mapHref.startsWith("https://www.google.com/maps/") && (await map.getAttribute("target")) === "_blank");
  // klik na mapu otevře nové okno se správnou adresou (síť do Googlu se v testu blokuje)
  await page.context().route("https://www.google.com/**", (r) => r.fulfill({ status: 200, body: "mapa" }));
  const [popup] = await Promise.all([page.waitForEvent("popup"), map.click()]);
  check(`${name}: klik na mapu`, popup.url().startsWith("https://www.google.com/maps/"), popup.url().slice(0, 60));
  await popup.close();
  await page.locator("footer").screenshot({ path: `${OUT}/paticka-${name}.jpg`, type: "jpeg", quality: 70 });

  // --- menu
  await page.goto(url("/"), { waitUntil: "networkidle" });
  const burger = page.getByRole("button", { name: "Otevřít menu" });
  const desktopNav = page.locator('nav[aria-label="Hlavní menu"]').first();
  const cart = page.getByRole("link", { name: /^Košík/ });
  check(`${name}: košík v záhlaví`, await cart.isVisible());
  if (!mobileMenu) {
    check(`${name}: menu v řádku (bez ☰)`, !(await burger.isVisible()) && (await desktopNav.isVisible()));
    const labels = (await page.locator('header nav[aria-label="Hlavní menu"] > ul > li > a, header nav[aria-label="Hlavní menu"] > ul > li > button').allInnerTexts()).map((s) => s.trim());
    check(`${name}: položky menu v pořadí`, labels.join("|") === MENU.filter((m) => labels.includes(m)).join("|") && labels.includes("MojeBegina"), labels.join("|"));
    const navH = (await page.locator('header nav[aria-label="Hlavní menu"] > ul').boundingBox()).height;
    check(`${name}: menu se vejde na jeden řádek`, navH < 40, `${navH}px`);
    await page.close();
    continue;
  }
  check(`${name}: ikona ☰ viditelná, plocha min. 44 px`, (await burger.isVisible()) && (await burger.boundingBox()).width >= 44);
  await burger.tap();
  const panel = page.locator('header nav[aria-label="Menu"]');
  await panel.waitFor({ state: "visible" });
  const top = (await panel.locator(":scope > ul > li > a, :scope > ul > li > button").allInnerTexts()).map((s) => s.trim());
  // testovací DB nemusí mít všechny kategorie (menu ukazuje jen ty z katalogu)
  const expected = MENU.filter((m) => top.includes(m));
  check(`${name}: menu má položky v pořadí`, top.join("|") === expected.join("|") && top.includes("O nás") && top.includes("MojeBegina"), `${top.join("|")}${expected.length < MENU.length ? ` (v testovací DB chybí: ${MENU.filter((m) => !top.includes(m)).join(", ")})` : ""}`);
  const hasDrinks = top.includes("Nápoje");
  if (hasDrinks) await panel.getByRole("button", { name: "Nápoje" }).tap();
  for (const d of hasDrinks ? DRINKS : []) {
    const link = panel.getByRole("link", { name: d, exact: true });
    await link.scrollIntoViewIfNeeded();
    check(`${name}: Nápoje → ${d} dostupné`, await link.isVisible());
  }
  const last = panel.getByRole("link", { name: "MojeBegina" });
  await last.scrollIntoViewIfNeeded();
  const lb = await last.boundingBox();
  check(`${name}: poslední položka dosažitelná posunutím`, lb && lb.y + lb.height <= viewport.height + 1, `y ${lb?.y}`);
  check(`${name}: MojeBegina → zákaznická část`, (await last.getAttribute("href")) === "https://moje.begina.cz/");
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: otevřené menu nepřetéká`, sw <= viewport.width, `scrollWidth ${sw}`);
  await page.screenshot({ path: `${OUT}/menu-${name}.jpg`, type: "jpeg", quality: 70 });
  // zavření křížkem
  await page.getByRole("button", { name: "Zavřít menu" }).tap();
  check(`${name}: zavře křížek`, !(await panel.isVisible()));
  // zavření klepnutím na pozadí
  await burger.tap();
  await page.mouse.click(viewport.width / 2, viewport.height - 5);
  await page.waitForTimeout(100);
  const stillOpen = await panel.isVisible();
  // pozadí může být celé zakryté panelem (dlouhé menu na malé obrazovce)
  if (stillOpen) await page.keyboard.press("Escape");
  check(`${name}: zavře klepnutí mimo / Esc`, !(await panel.isVisible()));
  // každá položka e-shopu vede na existující stránku
  for (const [label, sub] of [...expected.filter((m) => m !== "Nápoje" && m !== "MojeBegina").map((m) => [m, false]), ...(hasDrinks ? DRINKS : []).map((d) => [d, true])]) {
    await page.goto(url("/"), { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Otevřít menu" }).tap();
    if (sub) await panel.getByRole("button", { name: "Nápoje" }).tap();
    const link = panel.getByRole("link", { name: label, exact: true });
    await link.scrollIntoViewIfNeeded();
    const href = await link.getAttribute("href");
    const [resp] = await Promise.all([page.waitForURL((u) => u.pathname === href, { timeout: 15000 }).then(() => true).catch(() => false), link.tap()]);
    await page.waitForLoadState("networkidle");
    const h = await page.locator("h1").first().textContent().catch(() => "");
    const notFound = /nenalezena|404/i.test(h ?? "");
    check(`${name}: „${label}“ → ${href}`, resp && !notFound && !(await panel.isVisible()), `h1 „${h}“`);
  }
  await page.close();
}
await browser.close();
console.log(passed.map((p) => `✓ ${p}`).join("\n"));
if (failures.length) {
  console.log(failures.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

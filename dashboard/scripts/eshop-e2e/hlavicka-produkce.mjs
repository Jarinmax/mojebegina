// Ověření hlavičky přímo na produkčním https://begina.cz (jen čtení, nic se
// neodesílá): všechny položky menu včetně Zmrzlin, 100% přiblížení,
// notebooky 1280–1920 px; logo, menu a košík se nepřekrývají, nic nepřetéká.
//   node scripts/eshop-e2e/hlavicka-produkce.mjs
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const OUT = process.env.OUT_DIR ?? "/tmp/prod";
mkdirSync(OUT, { recursive: true });
const failures = [], passed = [];
const check = (n, ok, d = "") => (ok ? passed : failures).push(`${n}${d ? ` — ${d}` : ""}`);
const MENU = ["Čerstvé polévky", "Bylinné sirupy", "Nápoje", "Zmrzliny", "O nás", "O vodě", "MojeBegina"];
const CASES = [
  // [název, šířka × výška v CSS px, poměr pixelů]
  ["notebook-1280x720", 1280, 720, 1],      // 13" Windows / 1920 px se 150 % měřítkem systému
  ["notebook-1280x800", 1280, 800, 2],      // 13" MacBook (výchozí zobrazení)
  ["notebook-1366x768", 1366, 768, 1],      // běžný levnější notebook
  ["notebook-1440x900", 1440, 900, 2],      // MacBook Air 13"
  ["notebook-1536x864", 1536, 864, 1.25],   // 1920 px se 125 % měřítkem systému
  ["monitor-1920x1080", 1920, 1080, 1],
  ["uzky-notebook-1229x691", 1229, 691, 1.25], // 1536 px se 125 % — menu ☰
];
const browser = await chromium.launch();
for (const [name, w, h, dpr] of CASES) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const res = await page.goto(process.env.BASE_URL ?? "https://begina.cz/", { waitUntil: "networkidle" });
  check(`${name}: produkční stránka načtená`, res.ok(), `HTTP ${res.status()} ${page.url()}`);
  const zoom = await page.evaluate(() => ({ dpr: window.devicePixelRatio, inner: window.innerWidth }));
  check(`${name}: 100% přiblížení prohlížeče`, zoom.inner === w, `innerWidth ${zoom.inner}, devicePixelRatio ${zoom.dpr}`);
  const hd = await page.evaluate(() => {
    const header = document.querySelector("header");
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width && b.height ? { l: b.left, r: b.right, t: b.top, b: b.bottom } : null; };
    const nav = [...header.querySelectorAll('nav[aria-label="Hlavní menu"]')].find((n) => n.getBoundingClientRect().width > 0);
    const items = nav ? [...nav.querySelectorAll(":scope > ul > li > a, :scope > ul > li > button")].map((el) => ({ ...box(el), label: el.textContent.trim() })) : [];
    const logo = header.querySelector('a[aria-label^="Begina.cz"]');
    const cart = header.querySelector('a[aria-label^="Košík"]');
    const burger = header.querySelector('button[aria-label="Otevřít menu"]');
    return { logo: box(logo), cart: box(cart), burger: box(burger), items, navUlH: nav?.querySelector("ul").getBoundingClientRect().height ?? null,
      navFont: nav ? parseFloat(getComputedStyle(nav.querySelector("ul")).fontSize) : null, logoImg: logo.querySelector("img").getBoundingClientRect().height,
      headerSW: header.scrollWidth, headerW: header.clientWidth, docSW: document.documentElement.scrollWidth };
  });
  check(`${name}: hlavička ani stránka nepřetéká`, hd.headerSW <= hd.headerW && hd.docSW <= w, `hlavička ${hd.headerSW}/${hd.headerW}, stránka ${hd.docSW}/${w}`);
  if (hd.items.length) {
    const labels = hd.items.map((i) => i.label);
    check(`${name}: menu v řádku má všechny položky včetně Zmrzlin`, labels.join("|") === MENU.join("|"), labels.join(" | "));
    const row = [hd.logo, ...hd.items, hd.cart];
    const gaps = row.slice(1).map((b, i) => Math.round(b.l - row[i].r));
    const sameLine = hd.items.every((i) => Math.abs((i.t + i.b) / 2 - (hd.items[0].t + hd.items[0].b) / 2) < 3);
    check(`${name}: logo, položky a košík se nepřekrývají, menu na jednom řádku`, gaps.every((g) => g >= 16) && sameLine && hd.navUlH < 36,
      `mezery logo→menu ${gaps[0]} px, mezi položkami ${gaps.slice(1, -1).join("/")} px, menu→košík ${gaps.at(-1)} px; písmo ${hd.navFont} px, logo ${Math.round(hd.logoImg)} px`);
  } else {
    check(`${name}: užší okno → menu pod ☰, košík v záhlaví`, !!hd.burger && !!hd.cart && hd.burger.l >= hd.cart.r && hd.cart.l > hd.logo.r + 16, `☰ ${!!hd.burger}`);
    await page.getByRole("button", { name: "Otevřít menu" }).click();
    const labels = (await page.locator('header nav[aria-label="Menu"] > ul > li > a, header nav[aria-label="Menu"] > ul > li > button').allInnerTexts()).map((s) => s.trim());
    check(`${name}: menu ☰ má všechny položky včetně Zmrzlin`, labels.join("|") === MENU.join("|"), labels.join(" | "));
    await page.getByRole("button", { name: "Zavřít menu" }).click();
  }
  await page.locator("header").screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
}
await browser.close();
console.log(passed.map((p) => `✓ ${p}`).join("\n"));
if (failures.length) { console.log(failures.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

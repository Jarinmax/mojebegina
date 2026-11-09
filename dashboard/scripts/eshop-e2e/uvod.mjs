// begina.cz — úvodní blok (majitel 9. 11. 2026): nadpis přesně na tři řádky,
// zarovnání podle rozložení (fotka vedle = doleva, fotka pod = na střed),
// fotka bez rámečku a stínu s pozadím splývajícím s béžovou úvodu.
// Počítač, iPad / tablet a mobil, na výšku i na šířku.
//   node scripts/eshop-e2e/uvod.mjs 3100
import { mkdirSync } from "node:fs";

const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/uvod";
mkdirSync(OUT, { recursive: true });
const failures = [];
const passed = [];
const check = (name, ok, detail = "") => (ok ? passed : failures).push(`${name}${detail ? ` — ${detail}` : ""}`);
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1`] });
const url = (p) => `http://begina.cz:${PORT}${p}`;
const land = (d) => devices[`${d} landscape`];
const CASES = [
  ["pocitac-1440", { viewport: { width: 1440, height: 900 } }],
  ["pocitac-1280", { viewport: { width: 1280, height: 720 } }],
  ["pocitac-1366", { viewport: { width: 1366, height: 768 } }],
  ["pocitac-1536", { viewport: { width: 1536, height: 864 } }],
  ["pocitac-1920", { viewport: { width: 1920, height: 1080 } }],
  ["ipad-vysku", devices["iPad (gen 7)"]],
  ["ipad-sirku", land("iPad (gen 7)")],
  ["ipad-mini-vysku", devices["iPad Mini"]],
  ["ipad-mini-sirku", land("iPad Mini")],
  ["ipad-pro-vysku", devices["iPad Pro 11"]],
  ["ipad-pro-sirku", land("iPad Pro 11")],
  ["tablet-android-vysku", devices["Galaxy Tab S4"]],
  ["tablet-android-sirku", land("Galaxy Tab S4")],
  ["iphone-vysku", devices["iPhone 13"]],
  ["iphone-sirku", land("iPhone 13")],
  ["iphone-se-vysku", devices["iPhone SE"]],
  ["iphone-se-sirku", land("iPhone SE")],
  ["android-vysku", devices["Pixel 5"]],
  ["android-sirku", land("Pixel 5")],
];
const LINES = ["Čerstvé polévky", "Bylinné sirupy", "Nápoje a zmrzliny"];

for (const [name, device] of CASES) {
  if (!device) { check(`${name}: profil zařízení`, false, "chybí v Playwright"); continue; }
  const ctx = await browser.newContext({ ...device, deviceScaleFactor: name.startsWith("pocitac") ? 1 : device.deviceScaleFactor });
  const page = await ctx.newPage();
  const vw = page.viewportSize().width;
  await page.goto(url("/"), { waitUntil: "networkidle" });
  const img = page.getByRole("img", { name: /dýňová polévka/i });
  await img.evaluate((el) => (el.complete ? null : new Promise((r) => el.addEventListener("load", r, { once: true }))));
  const r = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const spans = [...h1.querySelectorAll("span")];
    const lh = parseFloat(getComputedStyle(h1).lineHeight);
    const img = document.querySelector("section img");
    const ib = img.getBoundingClientRect();
    const hb = h1.getBoundingClientRect();
    const btn = [...document.querySelectorAll("section a")].find((a) => a.textContent.includes("Vybrat polévku")).getBoundingClientRect();
    const sub = h1.nextElementSibling.getBoundingClientRect();
    const st = getComputedStyle(img);
    const bw = st.borderTopWidth;
    // barva pozadí fotky v rozích × barva podkladu úvodu
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const px = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
    const corners = [px(4, 4), px(c.width - 5, 4), px(4, c.height - 5), px(c.width - 5, c.height - 5), px(Math.round(c.width / 2), 6)];
    const bg = getComputedStyle(img.closest("section")).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
    return {
      spans: spans.map((s) => ({ t: s.textContent.replace(/ /g, " "), h: s.getBoundingClientRect().height, w: s.getBoundingClientRect().width })),
      lh, fs: parseFloat(getComputedStyle(h1).fontSize), align: getComputedStyle(h1).textAlign, h1h: hb.height,
      hx: hb.x, hw: hb.width, hcenterText: spans.map((s) => { const r = document.createRange(); r.selectNodeContents(s); const b = r.getBoundingClientRect(); return b.x + b.width / 2; }),
      hleftText: spans.map((s) => { const r = document.createRange(); r.selectNodeContents(s); return r.getBoundingClientRect().x; }),
      btnx: btn.x, subx: sub.x, ib: { x: ib.x, y: ib.y, w: ib.width, h: ib.height }, hbottom: hb.bottom, hright: hb.right,
      radius: st.borderRadius, shadow: st.boxShadow, border: bw, corners, bg,
      text: h1.textContent,
      sw: document.documentElement.scrollWidth,
    };
  });
  check(`${name}: tři řádky textu`, r.spans.map((s) => s.t).join("|") === LINES.join("|") && !/[,.]/.test(r.text), r.spans.map((s) => s.t).join(" / "));
  check(`${name}: žádný řádek se neláme`, r.spans.every((s) => s.h <= r.lh * 1.2) && Math.round(r.h1h / r.lh) === 3, `výšky ${r.spans.map((s) => Math.round(s.h)).join("/")} řádek ${r.lh}`);
  check(`${name}: velikost písma přiměřená`, r.fs >= 24 && r.fs <= 46, `${r.fs}px`);
  const beside = r.ib.x >= r.hright - 1;
  if (beside) {
    check(`${name}: fotka vedle → nadpis doleva podle textu a tlačítek`, r.align === "left" && r.hleftText.every((x) => Math.abs(x - r.btnx) < 3) && Math.abs(r.subx - r.btnx) < 3, `nadpis ${r.hleftText.map(Math.round)} tlačítko ${Math.round(r.btnx)} text ${Math.round(r.subx)}`);
  } else {
    check(`${name}: fotka pod → nadpis na střed`, r.align === "center" && r.hbottom <= r.ib.y && r.hcenterText.every((x) => Math.abs(x - vw / 2) < 3), `středy ${r.hcenterText.map(Math.round)} / ${vw / 2}`);
  }
  check(`${name}: fotka bez rámečku a stínu`, (r.radius === "0px" || r.radius === "") && r.shadow === "none" && r.border === "0px", `${r.radius} ${r.shadow} ${r.border}`);
  const diff = Math.max(...r.corners.flatMap((c) => c.map((v, i) => Math.abs(v - r.bg[i]))));
  check(`${name}: pozadí fotky splývá s béžovou`, diff <= 4, `rohy ${JSON.stringify(r.corners)} podklad ${r.bg}`);
  check(`${name}: bez vodorovného přetékání`, r.sw <= vw, `scrollWidth ${r.sw} / ${vw}`);
  // --- hlavička: logo, menu a košík bez překrývání, nic nepřetéká
  const hd = await page.evaluate(() => {
    const header = document.querySelector("header");
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width && b.height ? { l: b.left, r: b.right, t: b.top, b: b.bottom } : null; };
    const logoLink = header.querySelector('a[aria-label^="Begina.cz"]');
    const nav = [...header.querySelectorAll('nav[aria-label="Hlavní menu"]')].find((n) => n.getBoundingClientRect().width > 0);
    const cart = header.querySelector('a[aria-label^="Košík"]');
    const burger = header.querySelector('button[aria-label="Otevřít menu"]');
    const navUl = nav?.querySelector("ul");
    return {
      logo: box(logoLink), nav: box(nav), cart: box(cart), burger: box(burger),
      logoImg: logoLink.querySelector("img").getBoundingClientRect().height,
      brand: parseFloat(getComputedStyle(logoLink.querySelector("span span")).fontSize),
      navFont: navUl ? parseFloat(getComputedStyle(navUl).fontSize) : null,
      navH: navUl ? navUl.getBoundingClientRect().height : null,
      headerSW: header.scrollWidth, headerW: header.clientWidth,
    };
  });
  // logo | menu | [košík ☰] — košík a ☰ tvoří skupinu (mezi nimi se jen nesmí překrývat)
  const parts = [hd.logo, hd.nav, hd.cart].filter(Boolean).sort((a, b) => a.l - b.l);
  const gaps = parts.slice(1).map((p, i) => Math.round(p.l - parts[i].r));
  const burgerOk = !hd.burger || hd.burger.l >= hd.cart.r;
  check(`${name}: hlavička bez překrývání`, gaps.every((g) => g >= 12) && burgerOk && hd.headerSW <= hd.headerW && [...parts, hd.burger].filter(Boolean).every((p) => p.r <= vw && p.l >= 0), `mezery ${gaps.join("/")} px${hd.burger ? `, košík–☰ ${Math.round(hd.burger.l - hd.cart.r)} px` : ""}`);
  if (hd.nav) {
    check(`${name}: počítač — logo o 20 % větší, menu 17 px na jednom řádku`, Math.abs(hd.logoImg - 43.2) < 1 && Math.abs(hd.brand - 21.6) < 0.5 && hd.navFont === 17 && hd.navH < 32, `logo ${hd.logoImg}px, nápis ${hd.brand}px, menu ${hd.navFont}px, výška menu ${hd.navH}`);
  } else {
    check(`${name}: mobil/tablet — logo beze změny`, hd.logoImg === 36 && hd.brand === 18, `logo ${hd.logoImg}px, nápis ${hd.brand}px`);
  }
  await page.locator("header").screenshot({ path: `${OUT}/${name}-hlavicka.jpg`, type: "jpeg", quality: 65 });
  await page.locator("section").first().screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 65 });
  await ctx.close();
}
await browser.close();
console.log(passed.map((p) => `✓ ${p}`).join("\n"));
if (failures.length) {
  console.log(failures.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}

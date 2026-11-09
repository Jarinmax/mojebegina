// begina.cz — čitelnost spodní části úvodu a patičky (9. 11. 2026): velikosti
// písma, řádkování ~1,5, kontrast, bez překrývání a přetékání. Počítač,
// iPad / tablet a mobil na výšku i na šířku.
//   node scripts/eshop-e2e/citelnost.mjs 3100
import { mkdirSync } from "node:fs";
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/citelnost";
mkdirSync(OUT, { recursive: true });
const failures = [], passed = [];
const check = (n, ok, d = "") => (ok ? passed : failures).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1`] });
const url = (p) => `http://begina.cz:${PORT}${p}`;
const land = (d) => devices[`${d} landscape`];
const CASES = [
  ["pocitac-1280", { viewport: { width: 1280, height: 720 } }],
  ["pocitac-1440", { viewport: { width: 1440, height: 900 } }],
  ["ipad-vysku", devices["iPad (gen 7)"]],
  ["ipad-sirku", land("iPad (gen 7)")],
  ["ipad-mini-vysku", devices["iPad Mini"]],
  ["iphone-vysku", devices["iPhone 13"]],
  ["iphone-sirku", land("iPhone 13")],
  ["iphone-se-vysku", devices["iPhone SE"]],
  ["android-vysku", devices["Pixel 5"]],
];
// relativní jas a kontrast (WCAG)
const lum = (rgb) => { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const [name, device] of CASES) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const vw = page.viewportSize().width;
  await page.goto(url("/"), { waitUntil: "networkidle" });
  const m = await page.evaluate(() => {
    const st = (el) => { const s = getComputedStyle(el); const fs = parseFloat(s.fontSize); const lh = s.lineHeight === "normal" ? fs * 1.2 : parseFloat(s.lineHeight); return { fs, lh: lh / fs, color: s.color.match(/\d+/g).slice(0, 3).map(Number), w: s.fontWeight }; };
    const bg = (el) => { while (el) { const c = getComputedStyle(el).backgroundColor; const m = c.match(/\d+(\.\d+)?/g); if (m && (m.length < 4 || Number(m[3]) > 0.5)) return m.slice(0, 3).map(Number); el = el.parentElement; } return [255, 255, 255]; };
    const pick = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ ...st(e), bg: bg(e), text: e.textContent.trim().slice(0, 30), box: e.getBoundingClientRect().toJSON() }));
    return {
      labels: pick('nav[aria-label="Kategorie"] a > span:last-child'),
      h2: pick("main section:has(h2) h2"),
      li: pick("main section:has(h2) li"),
      more: pick("main section:has(h2) a"),
      fh2: pick("footer section h2"),
      ftext: [...pick("footer address span"), ...pick("footer section p"), ...pick("footer section li span"), ...pick('footer nav[aria-label="Informace"] a')],
      fsections: pick("footer section").map((s) => s.box),
      sw: document.documentElement.scrollWidth,
    };
  });
  const rng = (arr, lo, hi) => arr.length > 0 && arr.every((e) => e.fs >= lo - 0.01 && e.fs <= hi + 0.01);
  const sizes = (arr) => [...new Set(arr.map((e) => Math.round(e.fs * 10) / 10))].join("/");
  check(`${name}: názvy pod ikonami 16 px`, rng(m.labels, 16, 16), sizes(m.labels));
  check(`${name}: nadpisy Proč Begina / Čistá voda 20 px`, rng(m.h2, 20, 20), sizes(m.h2));
  check(`${name}: body a odkazy Více o… 16 px`, rng(m.li, 16, 16) && rng(m.more, 16, 16), `${sizes(m.li)} / ${sizes(m.more)}`);
  check(`${name}: nadpisy patičky 17–18 px, výraznější řez`, rng(m.fh2, 17, 18) && m.fh2.every((e) => Number(e.w) >= 600), `${sizes(m.fh2)} px, řez ${m.fh2[0]?.w}`);
  check(`${name}: texty a odkazy patičky 16 px`, rng(m.ftext, 16, 16), sizes(m.ftext));
  const all = [...m.h2, ...m.li, ...m.ftext];
  check(`${name}: řádkování ~1,5 u odstavců a bodů`, [...m.li, ...m.ftext].every((e) => e.lh >= 1.4 && e.lh <= 1.65), [...new Set([...m.li, ...m.ftext].map((e) => e.lh.toFixed(2)))].join("/"));
  const cs = [...m.labels, ...all, ...m.fh2].map((e) => ({ c: contrast(e.color, e.bg), t: e.text }));
  const worst = cs.reduce((a, b) => (b.c < a.c ? b : a));
  check(`${name}: kontrast textu ≥ 4,5 : 1`, worst.c >= 4.5, `nejnižší ${worst.c.toFixed(1)} : 1 („${worst.t}“)`);
  const s = m.fsections;
  const overlap = s.some((a, i) => s.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
  check(`${name}: bloky patičky se nepřekrývají, pořadí zachované`, !overlap && (s[0].left < s[1].left && s[1].left < s[2].left || s[0].top < s[1].top && s[1].top < s[2].top), JSON.stringify(s.map((b) => [Math.round(b.left), Math.round(b.top)])));
  const lb = m.labels.map((l) => l.box);
  const lo = lb.some((a, i) => lb.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
  check(`${name}: názvy kategorií se nepřekrývají`, !lo);
  check(`${name}: bez vodorovného přetékání`, m.sw <= vw, `${m.sw}/${vw}`);
  await page.locator('nav[aria-label="Kategorie"]').screenshot({ path: `${OUT}/${name}-ikony.jpg`, type: "jpeg", quality: 70 });
  await page.locator("main section:has(h2)").first().screenshot({ path: `${OUT}/${name}-proc.jpg`, type: "jpeg", quality: 70 });
  await page.locator("footer").screenshot({ path: `${OUT}/${name}-paticka.jpg`, type: "jpeg", quality: 70 });
  await ctx.close();
}
await browser.close();
console.log(passed.map((p) => `✓ ${p}`).join("\n"));
if (failures.length) { console.log(failures.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

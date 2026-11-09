// Náhled při sdílení (10. 11. 2026): Open Graph / Twitter na úvodu a u
// produktu, obrázek veřejně dostupný; vykreslí ukázku karty jako ve WhatsAppu.
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const BASE = process.env.SHARE_BASE ?? `http://begina.cz:${PORT}`;
const OUT = process.env.OUT_DIR ?? "/tmp/sdileni";
mkdirSync(OUT, { recursive: true });
const fails = [], ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1`].filter(() => !process.env.SHARE_BASE) });
const page = await browser.newPage();
const meta = async (path) => {
  const res = await page.request.get(`${BASE}${path}`, { headers: { "user-agent": "WhatsApp/2.23.20.0 A" } });
  const html = await res.text();
  const get = (attr, key) => html.match(new RegExp(`<meta[^>]+${attr}="${key}"[^>]*content="([^"]*)"`))?.[1]?.replaceAll("&amp;", "&") ?? null;
  const icons = [...html.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon|shortcut icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  return { status: res.status(), title: get("property", "og:title"), desc: get("property", "og:description"), image: get("property", "og:image"), tw: get("name", "twitter:card"), twImg: get("name", "twitter:image"), icons };
};
const home = await meta("/");
check("úvod: og:title", home.title === "Begina – Když rozhoduje chuť", home.title);
check("úvod: og:description", home.desc === "Čerstvé polévky, bylinné sirupy, nápoje a zmrzliny. Objevte naši nabídku na begina.cz.", home.desc);
check("úvod: og:image = logo", /\/og-begina\.png\?v=/.test(home.image ?? ""), home.image);
check("úvod: twitter:card", home.tw === "summary_large_image" && /og-begina/.test(home.twImg ?? ""), `${home.tw} ${home.twImg}`);
check("úvod: ikona webu je logo (ne výchozí Next/Vercel)", home.icons.some((i) => /icon\.png|favicon/.test(i)), home.icons.join(" "));
const imgUrl = home.image.replace("https://begina.cz", BASE);
const img = await page.request.get(imgUrl);
check("obrázek náhledu veřejně dostupný", img.status() === 200 && /image\/png/.test(img.headers()["content-type"] ?? ""), `${img.status()} ${img.headers()["content-type"]}`);
for (const p of ["/favicon.ico", "/icon.png", "/apple-icon.png"]) {
  const r = await page.request.get(`${BASE}${p}`);
  check(`${p} dostupná`, r.status() === 200, String(r.status()));
}
const prod = await meta("/produkt/kulajda");
check("produkt: vlastní název a fotka", prod.title === "Kulajda" && /kulajda/.test(prod.image ?? "") && !/og-begina/.test(prod.twImg ?? ""), `${prod.title} ${prod.image} ${prod.twImg}`);
// ukázka karty jako ve WhatsAppu
const imgB64 = Buffer.from(await img.body()).toString("base64");
await page.setViewportSize({ width: 420, height: 420 });
await page.setContent(`<body style="margin:0;background:#e5ddd5;font-family:Helvetica,Arial,sans-serif;padding:16px">
  <div style="max-width:360px;margin-left:auto;background:#dcf8c6;border-radius:8px;padding:4px;box-shadow:0 1px 1px rgba(0,0,0,.15)">
    <div style="background:#cfe9ba;border-radius:6px;overflow:hidden">
      <img src="data:image/png;base64,${imgB64}" style="width:100%;display:block;aspect-ratio:1200/630;object-fit:cover">
      <div style="padding:8px 10px"><div style="font-weight:600;font-size:14px;color:#111">${home.title}</div>
      <div style="font-size:13px;color:#444;margin-top:2px">${home.desc}</div><div style="font-size:12px;color:#777;margin-top:4px">begina.cz</div></div>
    </div>
    <div style="padding:6px 6px 2px;font-size:14px;color:#027eb5">https://begina.cz</div>
  </div></body>`);
await page.screenshot({ path: `${OUT}/nahled-whatsapp.png` });
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) { console.log(fails.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

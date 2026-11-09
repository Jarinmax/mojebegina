// ESHOP — sirupy (9. 11. 2026): varianty „3 l“ a „700 ml“, tabulka
// „Informace o potravině“ (Skladování, Trvanlivost bez „Doplníme“, Příprava,
// Vrácení a reklamace s odkazem na obchodní podmínky), košík bez „Begina 3 l“
// a „750“. Počítač, iPad, mobil na výšku i na šířku. Nic se neobjednává.
import { mkdirSync } from "node:fs";
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3100);
const OUT = process.env.OUT_DIR ?? "/tmp/sirup";
mkdirSync(OUT, { recursive: true });
const fails = [], ok = [];
const check = (n, c, d = "") => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ""}`);
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP begina.cz 127.0.0.1"] });
const url = (p) => `http://begina.cz:${PORT}${p}`;
const SYRUPS = ["bylinny-sirup-saman", "zazvorovy-sirup", "lipovy-sirup", "ibiskovy-sirup", "sipkovy-sirup", "hermankovy-sirup", "medunkovy-sirup-s-levanduli"];
const CASES = [
  ["pocitac", { viewport: { width: 1440, height: 900 } }],
  ["ipad-vysku", devices["iPad (gen 7)"]],
  ["ipad-sirku", devices["iPad (gen 7) landscape"]],
  ["iphone-vysku", devices["iPhone 13"]],
  ["iphone-sirku", devices["iPhone 13 landscape"]],
];
const T = {
  "Skladování": "Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.",
  "Trvanlivost": "Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.",
  "Příprava": "Před použitím protřepejte. Doporučené ředění je 1 díl sirupu na 10 dílů vody. Intenzitu chuti upravte podle sebe.",
  "Vrácení a reklamace": "U neotevřeného sirupu můžete odstoupit od kupní smlouvy do 14 dnů od převzetí. Právo reklamovat vadné zboží tím není dotčeno. Podrobnosti o odstoupení a reklamacích najdete v obchodních podmínkách.",
};
for (const [name, device] of CASES) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const vw = page.viewportSize().width;
  for (const slug of name === "pocitac" ? SYRUPS : ["lipovy-sirup"]) {
    await page.goto(url(`/produkt/${slug}`), { waitUntil: "networkidle" });
    const section = page.locator("section[aria-labelledby=food-info]");
    for (const [label, text] of Object.entries(T)) {
      const dd = (await section.locator(`dt:text-is('${label}') + dd`).textContent().catch(() => null))?.trim();
      check(`${name} ${slug}: ${label}`, dd === text, dd ?? "chybí");
    }
    const body = await page.evaluate(() => document.querySelector("main").innerText);
    check(`${name} ${slug}: bez „Doplníme“ u trvanlivosti, bez starých textů`, !/25 °C|dobře uzavřeném|Zlaté pravidlo|20 ml sirupu|Begina 3 l|750 g|750 ml|bag-in-box|zavodn|zavír/i.test(body), (body.match(/25 °C|dobře uzavřeném|Zlaté pravidlo|20 ml sirupu|Begina 3 l|750 g|750 ml|bag-in-box/gi) ?? []).join(", "));
    const pick = body.match(/(^|\n)(3 l|700 ml)(?=\n|\s)/g) ?? [];
    check(`${name} ${slug}: varianty 3 l a 700 ml`, /(^|\n)3 l/.test(body) && /700 ml/.test(body), pick.map((x) => x.trim()).join(" | "));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${name} ${slug}: bez vodorovného přetékání`, sw <= vw, `${sw}/${vw}`);
  }
  const section = page.locator("section[aria-labelledby=food-info]");
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: `${OUT}/sirup-info-${name}.jpg`, type: "jpeg", quality: 70 });
  await Promise.all([page.waitForURL(url("/obchodni-podminky")), section.getByRole("link", { name: "obchodních podmínkách" }).click()]);
  check(`${name}: odkaz na obchodní podmínky`, page.url() === url("/obchodni-podminky"), page.url());
  await ctx.close();
}
await browser.close();
console.log(ok.map((p) => `✓ ${p}`).join("\n"));
if (fails.length) { console.log(fails.map((f) => `✗ ${f}`).join("\n")); process.exit(1); }

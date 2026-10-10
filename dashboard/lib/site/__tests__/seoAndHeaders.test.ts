// robots.txt, sitemap.xml, HSTS a hlavičky podle domény (next.config.ts),
// a přihlašovací cookies MojeBegina jen pro moje.begina.cz.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import robots from "@/app/robots";
import { INTERNAL_ROBOTS_TXT, publicRobotsTxt, sitemapXml } from "../seo";

const ROOT = path.join(__dirname, "../../..");

describe("robots.txt a sitemap.xml", () => {
  it("begina.cz bez ESHOP_INDEXING: zákaz všeho", () => {
    expect(publicRobotsTxt(false)).toBe("User-agent: *\nDisallow: /\n");
  });

  it("begina.cz s indexací: povoleno, bez košíku, pokladny a stránek objednávek; odkaz na sitemap", () => {
    const txt = publicRobotsTxt(true);
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Disallow: /kosik");
    expect(txt).toContain("Disallow: /pokladna");
    expect(txt).toContain("Disallow: /objednavka/");
    expect(txt).toContain("Sitemap: https://begina.cz/sitemap.xml");
    expect(txt).not.toMatch(/^Disallow: \/$/m);
  });

  it("moje.begina.cz: robots.txt vždy zakazuje vše", () => {
    expect(INTERNAL_ROBOTS_TXT).toBe("User-agent: *\nDisallow: /\n");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("sitemap: absolutní adresy https://begina.cz bez /eshop, bez duplicit, escapované", () => {
    const xml = sitemapXml(["/", "/produkt/kulajda", "/produkt/kulajda", "/o-nas", "/a&b"]);
    expect(xml).toContain("<loc>https://begina.cz/</loc>");
    expect(xml).toContain("<loc>https://begina.cz/produkt/kulajda</loc>");
    expect(xml.match(/produkt\/kulajda/g)).toHaveLength(1);
    expect(xml).toContain("https://begina.cz/a&amp;b");
    expect(xml).not.toContain("/eshop");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});

describe("hlavičky podle domény (next.config.ts)", () => {
  it("HSTS: MojeBegina beze změny (2 roky + subdomény); begina.cz 1 týden BEZ includeSubDomains; nikde preload", async () => {
    const rules = await nextConfig.headers!();
    const hsts = rules.filter((r) => r.headers.some((h) => h.key === "Strict-Transport-Security"));
    expect(hsts).toHaveLength(2);
    const internal = hsts.find((r) => r.missing)!;
    const pub = hsts.find((r) => r.has)!;
    expect(internal.source).toBe("/:path*");
    expect(internal.headers).toEqual([{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]);
    expect(pub.headers).toEqual([{ key: "Strict-Transport-Security", value: "max-age=604800" }]);
    // stejná podmínka, jednou has, jednou missing → na každé doméně přesně jedna HSTS
    expect(internal.missing).toEqual(pub.has);
    const pattern = new RegExp(`^${(pub.has![0] as { value: string }).value}$`);
    for (const host of ["begina.cz", "www.begina.cz"]) expect(pattern.test(host), host).toBe(true);
    for (const host of ["moje.begina.cz", "evilbegina.cz", "begina.cz.evil.com", "localhost"]) expect(pattern.test(host), host).toBe(false);
    expect(JSON.stringify(rules)).not.toContain("preload");
  });

  it("ostatní bezpečnostní hlavičky platí všude beze změny", async () => {
    const rules = await nextConfig.headers!();
    const common = rules.find((r) => r.source === "/:path*" && !r.has && !r.missing)!;
    expect(common.headers).toEqual([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ]);
  });

  it("stránka objednávky: bez cache a bez Referer (id v adrese neodchází dál) na obou doménách", async () => {
    const rules = await nextConfig.headers!();
    for (const source of ["/eshop/objednavka/:path*", "/objednavka/:path*"]) {
      const rule = rules.find((r) => r.source === source)!;
      expect(rule.headers).toEqual([
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ]);
    }
  });

  it("MojeBegina no-store routy zůstávají; next.config už nemá přesměrování (jsou v proxy.ts)", async () => {
    const rules = await nextConfig.headers!();
    for (const source of ["/", "/login", "/profil", "/objednavky", "/api/auth/:path*"]) {
      expect(rules.find((r) => r.source === source)?.headers, source).toEqual([{ key: "Cache-Control", value: "private, no-store" }]);
    }
    expect(nextConfig.redirects).toBeUndefined();
  });
});

describe("přihlášení MojeBegina se na begina.cz nedostane", () => {
  it("Neon Auth cookies bez nastavené domény = jen pro moje.begina.cz (begina.cz je nedostane)", () => {
    const code = readFileSync(path.join(ROOT, "lib/auth/server.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    const cookies = code.slice(code.indexOf("cookies:"), code.indexOf("}", code.indexOf("cookies:")));
    expect(cookies).toContain("secret");
    expect(cookies).not.toMatch(/domain/);
  });
});

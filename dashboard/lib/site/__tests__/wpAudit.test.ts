import { describe, expect, it } from "vitest";
import { orderNumberPlugins, parseHsts, parseSitemapLocs, pluginsFromHtml, productSlug, sitemapsFromRobots, verdictFor } from "../wpAudit";

describe("audit WordPressu před přepnutím domény", () => {
  it("sitemap: index i urlset (Yoast, Rank Math, WordPress core)", () => {
    const index = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://begina.cz/product-sitemap.xml</loc><lastmod>x</lastmod></sitemap>
      <sitemap><loc> https://begina.cz/page-sitemap.xml </loc></sitemap></sitemapindex>`;
    expect(parseSitemapLocs(index)).toEqual({
      sitemaps: ["https://begina.cz/product-sitemap.xml", "https://begina.cz/page-sitemap.xml"],
      urls: [],
    });
    const set = `<urlset><url><loc>https://begina.cz/produkt/kulajda/</loc><image:image><image:loc>https://begina.cz/a.jpg</image:loc></image:image></url>
      <url><loc>https://begina.cz/?a=1&amp;b=2</loc></url><url><loc>https://begina.cz/produkt/kulajda/</loc></url></urlset>`;
    expect(parseSitemapLocs(set).urls).toEqual(["https://begina.cz/produkt/kulajda/", "https://begina.cz/?a=1&b=2"]);
    expect(sitemapsFromRobots("User-agent: *\nSitemap: https://begina.cz/sitemap_index.xml\nsitemap:https://begina.cz/x.xml\n")).toEqual([
      "https://begina.cz/sitemap_index.xml",
      "https://begina.cz/x.xml",
    ]);
  });

  it("verdikt pro starou adresu podle skutečných pravidel proxy.ts (včetně řetězce přesměrování)", () => {
    expect(verdictFor("https://begina.cz/")).toEqual({ kind: "same", path: "/" });
    expect(verdictFor("https://begina.cz/produkt/kulajda/")).toEqual({ kind: "redirect", path: "/produkt/kulajda/", target: "/produkt/kulajda" });
    expect(verdictFor("https://begina.cz/kategorie-produktu/sirupy/")).toEqual({
      kind: "redirect",
      path: "/kategorie-produktu/sirupy/",
      target: "/kategorie/sirupy",
    });
    expect(verdictFor("https://begina.cz/gdpr/")).toEqual({ kind: "redirect", path: "/gdpr/", target: "/ochrana-osobnich-udaju" });
    expect(verdictFor("https://begina.cz/wp-login.php")).toEqual({ kind: "gone", path: "/wp-login.php" });
    expect(verdictFor("https://begina.cz/kontakt/")).toEqual({ kind: "missing", path: "/kontakt/", reason: "→ /kontakt = 404" });
    expect(verdictFor("https://begina.cz/partnersky-program/")).toMatchObject({ kind: "missing" });
    expect(productSlug("/produkt/kulajda/")).toBe("kulajda");
    expect(productSlug("/kategorie/x")).toBeNull();
  });

  it("doplněk pro čísla objednávek a HSTS", () => {
    const html = `<link href="https://begina.cz/wp-content/plugins/woocommerce/assets/x.css"><script src="/wp-content/plugins/wt-woocommerce-sequential-order-numbers/a.js">`;
    expect(pluginsFromHtml(html)).toEqual(["woocommerce", "wt-woocommerce-sequential-order-numbers"]);
    expect(orderNumberPlugins(pluginsFromHtml(html), ["wc/v3"])).toEqual(["wt-woocommerce-sequential-order-numbers"]);
    expect(orderNumberPlugins(["woocommerce", "yoast"], ["wc/store/v1", "wp/v2"])).toEqual([]);
    expect(parseHsts("max-age=31536000; includeSubDomains; preload")).toEqual({ maxAge: 31536000, includeSubDomains: true, preload: true });
    expect(parseHsts("max-age=300")).toEqual({ maxAge: 300, includeSubDomains: false, preload: false });
    expect(parseHsts(null)).toBeNull();
  });
});

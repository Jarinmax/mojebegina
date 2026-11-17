import { describe, expect, it } from "vitest";
import { buildFunnel, isBotUserAgent, isFunnelStep, isGoogleListingLanding, isTrackedStep, stepForPath } from "../funnel";

describe("měření e-shopu", () => {
  it("pozná krok podle adresy na begina.cz i v náhledu", () => {
    expect(stepForPath("/produkt/dynova-polevka")).toBe("product");
    expect(stepForPath("/eshop/produkt/saman")).toBe("product");
    expect(stepForPath("/kosik")).toBe("cart");
    expect(stepForPath("/eshop/pokladna")).toBe("checkout");
    expect(stepForPath("/")).toBeNull();
    expect(stepForPath("/objednavka/abc")).toBeNull();
    expect(stepForPath("/kategorie/polevky")).toBeNull();
  });

  it("přijme jen známé kroky", () => {
    expect(isFunnelStep("visit")).toBe(true);
    expect(isFunnelStep("paid")).toBe(false);
    expect(isFunnelStep("'; DROP TABLE")).toBe(false);
    expect(isFunnelStep(null)).toBe(false);
  });

  it("pozná proklik z bezplatného výpisu Google", () => {
    expect(isGoogleListingLanding("?srsltid=AfmBOoq123")).toBe(true);
    expect(isGoogleListingLanding("?utm_source=fb&srsltid=abc")).toBe(true);
    expect(isGoogleListingLanding("?srsltid=")).toBe(false);
    expect(isGoogleListingLanding("?xsrsltid=abc")).toBe(false);
    expect(isGoogleListingLanding("")).toBe(false);
    expect(isGoogleListingLanding(null)).toBe(false);
  });

  it("zapíše i kroky Google, nic jiného", () => {
    expect(isTrackedStep("google_visit")).toBe(true);
    expect(isTrackedStep("google_order")).toBe(true);
    expect(isTrackedStep("visit")).toBe(true);
    expect(isTrackedStep("google_paid")).toBe(false);
    expect(isFunnelStep("google_visit")).toBe(false);
  });

  it("nepočítá roboty ani prázdný prohlížeč", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });

  it("spočítá trychtýř a nedělí nulou", () => {
    const rows = buildFunnel({ visit: 200, product: 100, add_to_cart: 20, cart: 15, checkout: 10, order: 5, paid: 4 });
    expect(rows.map((row) => row.key)).toEqual(["visit", "product", "add_to_cart", "cart", "checkout", "order", "paid"]);
    expect(rows[1]).toMatchObject({ count: 100, ofVisitsPct: 50, ofPreviousPct: 50 });
    expect(rows[6]).toMatchObject({ count: 4, ofVisitsPct: 2, ofPreviousPct: 80 });
    expect(buildFunnel({})[3]).toMatchObject({ count: 0, ofVisitsPct: null, ofPreviousPct: null });
  });
});

import { buildFunnelReport } from "../funnelReport";

describe("týdenní report měření", () => {
  const day = (iso: string, counts: Record<string, number>) => ({ day: iso, counts });
  it("shrne týden, porovná s předchozím a najde největší odpad", () => {
    const week = [day("2026-11-22", { visit: 60, product: 30, add_to_cart: 3, cart: 3, checkout: 2, order: 2, paid: 1 }), day("2026-11-16", { visit: 40, product: 20 })];
    const previous = [day("2026-11-15", { visit: 50, paid: 1 })];
    const report = buildFunnelReport(week, previous);
    expect(report.subject).toContain("16. 11. – 22. 11.");
    expect(report.subject).toContain("konverze 1 %");
    expect(report.text).toContain("Návštěvy: 100 (50)");
    expect(report.text).toContain("Týden předtím: 2 %");
    expect(report.text).toContain("Největší odpad: Zobrazení produktu → Vložení do košíku, pokračuje jen 6 %.");
    expect(report.html).not.toContain("<script");
  });
  it("bez návštěv nic nevymýšlí", () => {
    const report = buildFunnelReport([day("2026-11-22", {})], [day("2026-11-15", {})]);
    expect(report.text).toContain("nelze spočítat (žádné návštěvy)");
    expect(report.text).toContain("Největší odpad zatím nejde určit");
  });
});

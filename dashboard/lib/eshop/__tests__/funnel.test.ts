import { describe, expect, it } from "vitest";
import { buildFunnel, isBotUserAgent, isFunnelStep, stepForPath } from "../funnel";

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

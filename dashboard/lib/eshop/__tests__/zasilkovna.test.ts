// Zásilkovna jen pro samotný Ochutnávkový set sirupů (11. 11. 2026).
import { describe, expect, it } from "vitest";
import {
  getShippingMethod,
  isZasilkovnaEligible,
  quoteShipping,
  ZASILKOVNA_PRICE_KC,
  ZASILKOVNA_SKUS,
} from "../shipping";

const CONTACT = { email: "info@begina.cz", phone: "+420 774 199 975" };
const SET = ZASILKOVNA_SKUS[0];
const line = (sku: string, quantity = 1) => ({ sku, name: sku, quantity, weightGrams: 800 });

describe("Zásilkovna", () => {
  const method = getShippingMethod("zasilkovna", "flat")!;

  it("je mezi způsoby doručení v obou režimech zdarma (kampaň), bez adresy", () => {
    expect(method.priceKc).toBe(ZASILKOVNA_PRICE_KC);
    expect(ZASILKOVNA_PRICE_KC).toBe(0);
    expect(method.requiresAddress).toBe(false);
    expect(getShippingMethod("zasilkovna", "weight")).toEqual(method);
  });

  it("nabídne se jen košíku, který obsahuje výhradně set", () => {
    expect(isZasilkovnaEligible([line(SET)])).toBe(true);
    expect(isZasilkovnaEligible([line(SET, 3)])).toBe(true);
    expect(isZasilkovnaEligible([line(SET), line("lipovy-sirup-3l")])).toBe(false);
    expect(isZasilkovnaEligible([line("lipovy-sirup-3l")])).toBe(false);
    expect(isZasilkovnaEligible([])).toBe(false);
  });

  it("cena: set = zdarma (kampaň), jiné zboží = nedostupné s vysvětlením", () => {
    for (const mode of ["flat", "weight"] as const) {
      expect(quoteShipping(method, [line(SET)], mode, CONTACT)).toEqual({ available: true, priceKc: 0, weightGrams: null });
      const mixed = quoteShipping(method, [line(SET), line("dynova-polevka-3l")], mode, CONTACT);
      expect(mixed.available).toBe(false);
      if (!mixed.available) {
        expect(mixed.reason).toBe("set_only");
        expect(mixed.message).toContain("Ochutnávkový set");
      }
    }
  });
});

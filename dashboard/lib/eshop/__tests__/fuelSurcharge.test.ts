import { afterEach, describe, expect, it } from "vitest";
import { COLD_SHIPPING_RULES, COLD_SHIPPING_SK_BANDS, FUEL_SURCHARGE_PERCENT, applyFuelSurcharge, coldShippingPrice, currentFuelSurchargePercent, validFuelPercent } from "../shippingRates";
import { findLandingPage } from "../landingPages";

describe("palivový příplatek z MojeBegina (22. 11. 2026)", () => {
  afterEach(() => applyFuelSurcharge(FUEL_SURCHARGE_PERCENT));

  it("výchozí 16 %: pásmo do 14,99 kg = 267 Kč", () => {
    expect(currentFuelSurchargePercent()).toBe(16);
    expect(coldShippingPrice(2950).ok && coldShippingPrice(2950)).toMatchObject({ priceKc: 267 });
  });

  it("změna procenta přepočítá všechna pásma ČR i SK i tabulku porcí", () => {
    applyFuelSurcharge(20);
    expect(COLD_SHIPPING_RULES[0].priceKc).toBe(Math.round((190 * 121 * 120) / 10_000));
    expect(COLD_SHIPPING_SK_BANDS[0].priceKc).toBe(Math.round((220 * 121 * 120) / 10_000));
    const page = findLandingPage("/polevky-pro-kavarny")!;
    expect(page.priceTable!.rows[0].totalKc).toBe(379 + COLD_SHIPPING_RULES[0].priceKc);
    expect(page.priceTable!.note).toContain(`${COLD_SHIPPING_RULES[0].priceKc} Kč`);
  });

  it("neplatné hodnoty se nepoužijí", () => {
    expect(validFuelPercent("17,5")).toBe(17.5);
    expect(validFuelPercent("160")).toBeNull();
    expect(validFuelPercent("abc")).toBeNull();
    applyFuelSurcharge(500);
    expect(currentFuelSurchargePercent()).toBe(16);
  });
});

import { syrupDrinkRows } from "../landingPages";
describe("nápoj ze sirupu s dopravou (22. 11. 2026)", () => {
  it("3 beginy = 450 nápojů, doprava v pásmu do 15 kg", () => {
    applyFuelSurcharge(16);
    const [row] = syrupDrinkRows([3]);
    expect(row.portions).toBe(450);
    expect(row.totalKc).toBe(3 * 499 + 267);
    expect(row.perPortionKc).toBe(3.92);
  });
});

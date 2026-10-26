// Ceník chlazené přepravy (WooCommerce Flexible Shipping, 11 pravidel) —
// hranice pásem, skutečné košíky z balení 3 kg / 0,75 kg / 0,5 kg,
// nad 150 kg, chybějící hmotnost. Osobní odběr: lib/eshop/shipping.ts.
import { describe, expect, it } from "vitest";
import { cartWeight, COLD_SHIPPING_MAX_GRAMS, COLD_SHIPPING_RULES, coldShippingPrice } from "../shippingRates";
import { getShippingMethod } from "../shipping";

const price = (kg: number) => {
  const result = coldShippingPrice(Math.round(kg * 1000));
  return result.ok ? result.priceKc : result.reason;
};

describe("ceník chlazené přepravy = WooCommerce (11 pravidel, beze změny)", () => {
  it("pravidla přesně jak jsou zapsaná ve WooCommerce", () => {
    expect(COLD_SHIPPING_RULES.map((r) => [r.fromKg, r.toKg, r.priceKc])).toEqual([
      [0, 14.99, 267],
      [15, 19.99, 379],
      [20, 29.99, 491],
      [30, 39.99, 604],
      [40, 49.99, 716],
      [50, 59.99, 828],
      [60, 69.99, 940],
      [70, 79.99, 1053],
      [80, 89.99, 1165],
      [90, 99.99, 1277],
      [100, 150, 1839],
    ]);
  });

  it.each([
    [0.5, 267],
    [14.99, 267],
    [15, 379],
    [19.99, 379],
    [20, 491],
    [29.99, 491],
    [30, 604],
    [39.99, 604],
    [40, 716],
    [49.99, 716],
    [50, 828],
    [59.99, 828],
    [60, 940],
    [69.99, 940],
    [70, 1053],
    [79.99, 1053],
    [80, 1165],
    [89.99, 1165],
    [90, 1277],
    [99.99, 1277],
    [100, 1839],
    [150, 1839],
  ])("hranice: %s kg → %s Kč", (kg, expected) => {
    expect(price(kg)).toBe(expected);
  });

  it("nad 150 kg žádné pravidlo neplatí → chlazenou přepravu nelze nabídnout", () => {
    expect(price(150.001)).toBe("over_limit");
    expect(price(153)).toBe("over_limit");
    expect(COLD_SHIPPING_MAX_GRAMS).toBe(150_000);
  });

  it("žádná mezera mezi pásmy (0,25kg kroky od 0,5 do 150 kg mají vždy cenu)", () => {
    for (let g = 500; g <= 150_000; g += 250) expect(coldShippingPrice(g).ok, `${g} g`).toBe(true);
  });
});

describe("hmotnost košíku — více kusů a různá balení", () => {
  const bag = (sku: string, quantity: number) => ({ sku, quantity, weightGrams: 3000 });
  const syrup750 = (quantity: number) => ({ sku: "lipovy-sirup-750ml", quantity, weightGrams: 750 });
  const cocktail500 = (quantity: number) => ({ sku: "svarak-deluxe-500ml", quantity, weightGrams: 500 });

  it.each([
    ["1× polévka 3 l", [bag("kulajda", 1)], 3000, 267],
    ["4× 3 l + 3× sirup 750 g = 14,25 kg", [bag("kulajda", 4), syrup750(3)], 14_250, 267],
    ["5× 3 l = přesně 15 kg (hranice)", [bag("kulajda", 3), bag("lipovy-caj-3l", 2)], 15_000, 379],
    ["6× 3 l + 1× koktejl 500 ml = 18,5 kg", [bag("kulajda", 6), cocktail500(1)], 18_500, 379],
    ["33× 3 l + 1× 750 g = 99,75 kg", [bag("kulajda", 33), syrup750(1)], 99_750, 1277],
    ["34× 3 l = 102 kg", [bag("kulajda", 34)], 102_000, 1839],
    ["50× 3 l = přesně 150 kg", [bag("kulajda", 50)], 150_000, 1839],
  ])("%s", (_name, lines, grams, expected) => {
    const weight = cartWeight(lines);
    expect(weight).toEqual({ ok: true, grams });
    expect(price(grams / 1000)).toBe(expected);
  });

  it("51× 3 l = 153 kg → nad limit", () => {
    const weight = cartWeight([bag("kulajda", 51)]);
    expect(weight.ok && coldShippingPrice(weight.grams)).toEqual({ ok: false, reason: "over_limit", grams: 153_000 });
  });

  it("položka bez hmotnosti → cenu nejde určit, nic se nedopočítává", () => {
    expect(cartWeight([bag("kulajda", 1), { sku: "dum-u-jezera-3l", quantity: 1, weightGrams: null }])).toEqual({
      ok: false,
      reason: "missing_weight",
      skus: ["dum-u-jezera-3l"],
    });
  });
});

describe("osobní odběr", () => {
  it("zdarma bez ohledu na hmotnost (i nad 150 kg a bez hmotností)", () => {
    const pickup = getShippingMethod("osobni-odber")!;
    expect(pickup.priceKc).toBe(0);
    expect(pickup.requiresAddress).toBe(false);
  });
});

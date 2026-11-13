// Ceník chlazené přepravy (11 pravidel WooCommerce + pásma do 400 kg podle
// tabulky CoolBalík, 12. 11. 2026; cena = základ × DPH × palivový příplatek) —
// hranice pásem, skutečné košíky z balení 3 kg / 0,75 kg / 0,5 kg,
// nad 400 kg, chybějící hmotnost. Osobní odběr: lib/eshop/shipping.ts.
import { describe, expect, it } from "vitest";
import { carrierPriceKc, cartWeight, COLD_SHIPPING_MAX_GRAMS, COLD_SHIPPING_RULES, coldShippingPrice, FUEL_SURCHARGE_PERCENT } from "../shippingRates";
import { getShippingMethod } from "../shipping";

const price = (kg: number) => {
  const result = coldShippingPrice(Math.round(kg * 1000));
  return result.ok ? result.priceKc : result.reason;
};

describe("ceník chlazené přepravy (pásma 1–11 beze změny, nově do 400 kg)", () => {
  it("palivový příplatek 16 %: cena = základ × 1,21 × 1,16 zaokrouhleně (tabulka Lucie)", () => {
    expect(FUEL_SURCHARGE_PERCENT).toBe(16);
    expect([190, 270, 1310, 1710, 2910, 3310].map((b) => carrierPriceKc(b))).toEqual([267, 379, 1839, 2400, 4084, 4646]);
    // změna paliva přepočítá ceny: 190 × 1,21 × 1,20 = 275,88
    expect(carrierPriceKc(190, 20)).toBe(276);
    expect(carrierPriceKc(190, 0)).toBe(230);
  });

  it("pravidla 1–11 přesně jak byla ve WooCommerce, 12–16 podle tabulky CoolBalík", () => {
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
      [150.001, 200, 2400],
      [200.001, 250, 2962],
      [250.001, 300, 3523],
      [300.001, 350, 4084],
      [350.001, 400, 4646],
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
    [150.001, 2400],
    [200, 2400],
    [200.001, 2962],
    [250, 2962],
    [250.001, 3523],
    [300, 3523],
    [300.001, 4084],
    [350, 4084],
    [350.001, 4646],
    [400, 4646],
  ])("hranice: %s kg → %s Kč", (kg, expected) => {
    expect(price(kg)).toBe(expected);
  });

  it("nad 400 kg žádné pravidlo neplatí → chlazenou přepravu nelze nabídnout", () => {
    expect(price(400.001)).toBe("over_limit");
    expect(price(402)).toBe("over_limit");
    expect(COLD_SHIPPING_MAX_GRAMS).toBe(400_000);
  });

  it("žádná mezera mezi pásmy (0,25kg kroky od 0,5 do 400 kg mají vždy cenu)", () => {
    for (let g = 500; g <= 400_000; g += 250) expect(coldShippingPrice(g).ok, `${g} g`).toBe(true);
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
    ["51× 3 l = 153 kg (dříve individuálně)", [bag("kulajda", 51)], 153_000, 2400],
    ["133× 3 l = 399 kg", [bag("kulajda", 99), bag("lipovy-caj-3l", 34)], 399_000, 4646],
  ])("%s", (_name, lines, grams, expected) => {
    const weight = cartWeight(lines);
    expect(weight).toEqual({ ok: true, grams });
    expect(price(grams / 1000)).toBe(expected);
  });

  it("134× 3 l = 402 kg → nad limit", () => {
    const weight = cartWeight([bag("kulajda", 99), bag("lipovy-caj-3l", 35)]);
    expect(weight.ok && coldShippingPrice(weight.grams)).toEqual({ ok: false, reason: "over_limit", grams: 402_000 });
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
  it("zdarma bez ohledu na hmotnost (i nad 400 kg a bez hmotností)", () => {
    const pickup = getShippingMethod("osobni-odber")!;
    expect(pickup.priceKc).toBe(0);
    expect(pickup.requiresAddress).toBe(false);
  });
});

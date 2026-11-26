import { describe, expect, it } from "vitest";
import { batchCostKc, calcVariant, formatQuantity, itemCostKc, parseBatchCount, parsePriceKc, type Recipe, type RecipeIngredient } from "../recipes";

// Smyšlená receptura — skutečná složení se do repozitáře neukládají.
const ing = (code: string, priceUnit: RecipeIngredient["priceUnit"], priceKc: number): RecipeIngredient => ({ id: code, kind: "surovina", code, name: code, priceUnit, priceKc, note: null });
const recipe: Recipe = {
  slug: "test",
  category: "sirupy",
  name: "Test",
  batchMl: 3000,
  note: null,
  archived: false,
  items: [
    { ingredient: ing("cukr", "kg", 40), quantity: 2000, unit: "g" },
    { ingredient: ing("stava", "l", 60), quantity: 500, unit: "ml" },
    { ingredient: ing("voda", "l", 0.2), quantity: 1.5, unit: "l" },
    { ingredient: ing("olej", "kapka", 0.5), quantity: 4, unit: "kapka" },
  ],
  variants: [],
};
const packaging = new Map([
  ["bag", 12],
  ["krabice", 14],
  ["etiketa", 2],
]);

describe("receptury – výpočty", () => {
  it("náklad položky převádí gramy a mililitry na kg a litry", () => {
    expect(itemCostKc(recipe.items[0])).toBeCloseTo(80);
    expect(itemCostKc(recipe.items[1])).toBeCloseTo(30);
    expect(itemCostKc(recipe.items[2])).toBeCloseTo(0.3);
    expect(itemCostKc(recipe.items[3])).toBeCloseTo(2);
    expect(batchCostKc(recipe)).toBeCloseTo(112.3);
  });

  it("begina: obsah + obaly, marže z prodejní ceny", () => {
    const calc = calcVariant(recipe, { label: "3 l", volumeMl: 3000, packagingCodes: ["bag", "krabice", "etiketa"], salePriceHal: 49900 }, packaging);
    expect(calc.contentKc).toBeCloseTo(112.3);
    expect(calc.packagingKc).toBe(28);
    expect(calc.totalKc).toBeCloseTo(140.3);
    expect(calc.marginKc).toBeCloseTo(358.7);
    expect(calc.marginPct).toBeCloseTo(71.88, 1);
  });

  it("sáček dostane poměrnou část obsahu; bez prodejní ceny není marže", () => {
    const calc = calcVariant(recipe, { label: "250 ml", volumeMl: 250, packagingCodes: ["etiketa"], salePriceHal: null }, packaging);
    expect(calc.contentKc).toBeCloseTo(112.3 / 12);
    expect(calc.marginKc).toBeNull();
    expect(calc.marginPct).toBeNull();
  });

  it("chybějící obal v ceníku ohlásí", () => {
    const calc = calcVariant(recipe, { label: "x", volumeMl: 500, packagingCodes: ["neni", "etiketa"], salePriceHal: 7900 }, packaging);
    expect(calc.missingPackaging).toEqual(["neni"]);
  });

  it("cena z formuláře", () => {
    expect(parsePriceKc("44,32")).toBe(44.32);
    expect(parsePriceKc("1 361 Kč")).toBe(1361);
    expect(parsePriceKc("0,157")).toBe(0.157);
    expect(parsePriceKc("0")).toBe(0);
    expect(parsePriceKc("-1")).toBeNull();
    expect(parsePriceKc("abc")).toBeNull();
    expect(parsePriceKc("1,23456")).toBeNull();
  });

  it("počet begin a zápis množství", () => {
    expect(parseBatchCount("5")).toBe(5);
    expect(parseBatchCount("0")).toBe(1);
    expect(parseBatchCount("2.5")).toBe(1);
    expect(parseBatchCount(undefined)).toBe(1);
    expect(formatQuantity(80, "g")).toBe("80 g");
    expect(formatQuantity(6000, "g")).toContain("6 kg");
    expect(formatQuantity(3, "kapka")).toBe("3 kapek");
  });
});

describe("nabídky dodavatelů", () => {
  it("cena za jednotku včetně dopravy", async () => {
    const { offerUnitPriceKc, isOfferInUse, lowestRegularUnitPriceKc, safeOfferUrl } = await import("../recipes");
    expect(offerUnitPriceKc({ packQty: 25, priceKc: 999, shippingKc: 109 })).toBe(44.32);
    expect(offerUnitPriceKc({ packQty: 750, priceKc: 1068, shippingKc: 0 })).toBe(1.424);
    expect(isOfferInUse({ packQty: 25, priceKc: 999, shippingKc: 109 }, 44.32)).toBe(true);
    const offer = (unit: number, isPromo = false) => ({ id: "x", ingredientId: null, itemName: "x", url: null, packLabel: "1 kg", packQty: 1, priceKc: unit, shippingKc: 0, isPromo, note: null });
    expect(lowestRegularUnitPriceKc([offer(45.96), offer(39.6, true), offer(44.32)])).toBe(44.32);
    expect(lowestRegularUnitPriceKc([])).toBeNull();
    expect(safeOfferUrl("javascript:alert(1)")).toBeNull();
    expect(safeOfferUrl("https://www.profikoreni.cz/x")).toBe("https://www.profikoreni.cz/x");
  });

  it("dopad změny ceny na náklad beginy", async () => {
    const { priceChangeImpact } = await import("../recipes");
    const impact = priceChangeImpact([recipe], "cukr", 50);
    expect(impact).toHaveLength(1);
    expect(impact[0].diffKc).toBe(20);
    expect(priceChangeImpact([recipe], "neni", 50)).toHaveLength(0);
  });
});

describe("applyEshopPrices", () => {
  const v = (volumeMl: number, salePriceHal: number | null) => ({ label: "x", volumeMl, packagingCodes: [], salePriceHal });
  it("přebírá cenu z e-shopu pro všechny varianty stejného objemu, i přes alias slugu", async () => {
    const { applyEshopPrices, eshopPriceKey } = await import("../recipes");
    const prices = new Map([[eshopPriceKey("malinovy-svarak-nealko", 3000), 399]]);
    const out = applyEshopPrices("malinovy-svarak", [v(3000, 38400), v(3000, 39900), v(500, 7900)], prices);
    expect(out.map((x) => x.salePriceHal)).toEqual([39900, 39900, 7900]);
  });
  it("výrobek mimo e-shop si nechá cenu z receptury", async () => {
    const { applyEshopPrices } = await import("../recipes");
    expect(applyEshopPrices("zoro", [v(3000, 36400)], new Map())[0].salePriceHal).toBe(36400);
  });
});

describe("keepSoldPackaging", () => {
  const v = (volumeMl: number, codes: string[]) => ({ label: codes.join("+"), volumeMl, packagingCodes: codes, salePriceHal: 1 });
  const variants = [v(3000, ["bag-3l"]), v(3000, ["bag-3l", "krabice-3l"]), v(500, ["kapsicka"])];
  it("polévky a nápoje: 3 l jen bez krabice", async () => {
    const { keepSoldPackaging } = await import("../recipes");
    expect(keepSoldPackaging("polevky", variants).map((x) => x.label)).toEqual(["bag-3l", "kapsicka"]);
  });
  it("sirupy: 3 l jen s krabicí", async () => {
    const { keepSoldPackaging } = await import("../recipes");
    expect(keepSoldPackaging("sirupy", variants).map((x) => x.label)).toEqual(["bag-3l+krabice-3l", "kapsicka"]);
  });
});

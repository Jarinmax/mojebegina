import { describe, expect, it } from "vitest";
import { profitByMonth, recipeSlugForLine, volumeForLine } from "../beginaProfit";
import type { Recipe, RecipeIngredient } from "@/lib/receptury/recipes";

describe("párování položek faktur s recepty", () => {
  it.each([
    ["Dýňová polévka 3L", "dynova-polevka"],
    ["Rajčatová polévka s řepou", "rajcatova-polevka-s-repou"],
    ["Rajčatová s řepou 3l", "rajcatova-polevka-s-repou"],
    ["Rajčatová polévka s červenou řepou – 3 l", "rajcatova-polevka-s-repou"],
    ["Tomatová polévka – 3 l", "tomatova-polevka"],
    ["Rajčatová polévka 3l", "tomatova-polevka"],
    ["Gulášová polévka s hlívou", "gulasova-polevka-z-hlivy"],
    ["Lipový sirup 750 ml", "lipovy-sirup"],
    ["Lipový čaj", "lipovy-caj"],
    ["Šaman sirup 3l", "saman-sirup"],
    ["Bylinkový čaj Šaman", "bylinny-caj-saman"],
    ["Černý čaj Golden Nepal", "cerny-caj-golden-nepal"],
    ["Malinový svařák nealko – 3 l", "malinovy-svarak"],
    ["Svařák Deluxe", "svarak-deluxe"],
  ])("%s → %s", (name, slug) => expect(recipeSlugForLine(name)).toBe(slug));
  it("nepoznané", () => {
    expect(recipeSlugForLine("Jahodová zmrzlina 5l")).toBeNull();
    expect(recipeSlugForLine("Svařák ")).toBeNull();
  });
  it("objem", () => {
    expect(volumeForLine("Dýňová polévka 3L", 379)).toBe(3000);
    expect(volumeForLine("Kulajda – 3 l", 379)).toBe(3000);
    expect(volumeForLine("kulajda 500 ml", 89)).toBe(500);
    expect(volumeForLine("Kulajda", 379)).toBe(3000);
    expect(volumeForLine("Ibiškový sirup", 199)).toBe(650);
    expect(volumeForLine("Lipový sirup 3l", 549)).toBe(3000);
    expect(volumeForLine("sirup Šaman kapsička ZDARMA", 0)).toBeNull();
  });
});

describe("zisk po měsících", () => {
  const ingredients: RecipeIngredient[] = [
    { id: "1", kind: "surovina", code: "DYNE", name: "Dýně", priceUnit: "kg", priceKc: 20, note: null },
    { id: "2", kind: "obal", code: "BAG3", name: "Bag 3 l", priceUnit: "ks", priceKc: 15, note: null },
  ];
  const recipes: Recipe[] = [
    {
      slug: "dynova-polevka", category: "polevky", name: "Dýňová", batchMl: 3000, note: null, archived: false,
      items: [{ ingredient: ingredients[0], quantity: 1500, unit: "g" }],
      variants: [{ label: "3 l", volumeMl: 3000, packagingCodes: ["BAG3"], salePriceHal: 37900 }],
    },
  ];
  it("tržba, doprava, suroviny, obaly a spotřeba", () => {
    const [m] = profitByMonth(
      [{ number: "1", month: 10, lines: [
        { name: "Dýňová polévka 3l", quantity: 2, totalKc: 758 },
        { name: "Chlazená přeprava", quantity: 1, totalKc: 267 },
        { name: "Jahodová zmrzlina 5l", quantity: 1, totalKc: 1000 },
      ] }],
      recipes, ingredients,
    );
    expect(m.revenueKc).toBe(2025);
    expect(m.shippingKc).toBe(267);
    expect(m.ingredientsKc).toBeCloseTo(60);
    expect(m.packagingKc).toBe(30);
    expect(m.unknown).toEqual([{ name: "Jahodová zmrzlina 5l", quantity: 1, totalKc: 1000 }]);
    expect(m.uses.find((u) => u.name === "Dýně")?.quantity).toBeCloseTo(3);
  });
  it("faktury za montáže se nepočítají", () => {
    expect(profitByMonth([{ number: "2", month: 7, lines: [{ name: "Montáž klimatizace", quantity: 1, totalKc: 5000 }] }], recipes, ingredients)).toEqual([]);
  });
});

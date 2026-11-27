import { describe, expect, it } from "vitest";
import { orderCost, recipeByProductSlug } from "../productionCost";
import type { Recipe } from "../recipes";

const recipe: Recipe = {
  slug: "malinovy-svarak", category: "ovocne-napoje", name: "X", batchMl: 3000, note: null, archived: false,
  items: [{ ingredient: { id: "a", kind: "surovina", code: "a", name: "a", priceUnit: "l", priceKc: 30, note: null }, quantity: 3, unit: "l" }],
  variants: [{ label: "3 l", volumeMl: 3000, packagingCodes: ["bag"], salePriceHal: 39900 }],
};

describe("orderCost", () => {
  it("sečte náklad podle receptury (i přes alias slugu) a nalezené položky", () => {
    const map = recipeByProductSlug([recipe]);
    const r = orderCost([{ name: "Svařák", quantity: 2, productSlug: "malinovy-svarak-nealko", volumeMl: 3000 }, { name: "Ruční", quantity: 1 }], map, new Map([["bag", 10]]));
    expect(r.costKc).toBe(200);
    expect(r.unknown).toEqual(["Ruční"]);
  });
});

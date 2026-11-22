import { describe, expect, it } from "vitest";
import { cheapestSyrupDrinkKc, withSyrupDrinkPrice } from "../syrupDrinkPrice";
const p = (price: number, soldOut = false) => ({ category: "sirupy", variants: [{ volumeMl: 3000, priceKc: price, servings: 150, soldOut }, { volumeMl: 650, priceKc: 199, servings: 32 }] }) as any;
describe("cena nápoje v kategorii Sirupy", () => {
  it("z nejlevnější nevyprodané beginy 3 l, na haléře", () => {
    const kc = cheapestSyrupDrinkKc([p(549), p(499), p(399, true)]);
    expect(withSyrupDrinkPrice("Vybrat si můžete třílitrovou beginu s kohoutkem (až 150 nápojů, nápoj už od 3,30 Kč).", kc).replace(/ /g, " "))
      .toBe("Vybrat si můžete třílitrovou beginu s kohoutkem (až 150 nápojů, nápoj od 3,33 Kč za 200 ml bez dopravy).");
  });
});

import { describe, expect, it } from "vitest";
import { COLD_SHIPPING_SK_BANDS, coldShippingPriceSk } from "../shippingRates";

describe("chlazená přeprava – Slovensko (tabulka Lucie, palivo 16 %)", () => {
  it("ceny pásem odpovídají sloupci „Cena na e-shop“", () => {
    expect(COLD_SHIPPING_SK_BANDS.map((band) => band.priceKc)).toEqual([
      309, 365, 421, 533, 646, 758, 870, 983, 1095, 1207, 1319, 1881, 1881, 1881, 1881, 1881, 2442, 3004, 3565, 4127, 4688,
    ]);
  });
  it("pásmo je „váha do“ včetně horní hranice", () => {
    expect(coldShippingPriceSk(4_025)).toMatchObject({ ok: true, priceKc: 309 }); // 5 kapsiček sirupu
    expect(coldShippingPriceSk(10_000)).toMatchObject({ ok: true, priceKc: 309 });
    expect(coldShippingPriceSk(10_001)).toMatchObject({ ok: true, priceKc: 365 });
    expect(coldShippingPriceSk(19_130)).toMatchObject({ ok: true, priceKc: 421 }); // 5 × 3 l sirup v krabici
    expect(coldShippingPriceSk(400_000)).toMatchObject({ ok: true, priceKc: 4688 });
    expect(coldShippingPriceSk(400_001)).toMatchObject({ ok: false, reason: "over_limit" });
  });
});

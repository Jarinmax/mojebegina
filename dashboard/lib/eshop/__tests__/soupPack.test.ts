// Ochutnávka polévek 3 × 450 ml (24. 11. 2026): tři různé polévky, 299 Kč, chlazeně nebo osobně, opakovaně.
import { describe, expect, it } from "vitest";
import { SOUP_PACK_NEEDS_CHOICE, SOUP_PACK_NO_ZASILKOVNA, SOUP_PACK_SKU, SOUP_PACK_SLUG, soupChoiceLine, soupPackCartSku, validSoupChoice } from "../soupPack";
import { createCatalogIndex } from "../catalogIndex";
import { catalogIndex } from "./helpers/catalogFixture";
import { priceCart } from "../pricing";
import { resolveCartLines } from "../cart";
import { choiceLine } from "../tastingSet";
import type { Product } from "../types";

const base = catalogIndex.getProduct("kulajda")!;
const pack: Product = {
  ...base,
  slug: SOUP_PACK_SLUG,
  name: "Ochutnávka polévek 3 × 450 ml",
  variants: [{ ...base.variants[0], sku: SOUP_PACK_SKU, label: null, priceKc: 299, volumeMl: 1350, servings: 6, weightGrams: 1500 }],
};
const index = createCatalogIndex({ ...catalogIndex.catalog, products: [...catalogIndex.catalog.products, pack] });

describe("Ochutnávka polévek 3 × 450 ml", () => {
  it("výběr: přesně tři různé polévky, pořadí nehraje roli", () => {
    expect(validSoupChoice(["dy", "ku", "to"])).toBe(true);
    expect(validSoupChoice(["dy", "dy", "to"])).toBe(false);
    expect(validSoupChoice(["dy", "ku"])).toBe(false);
    expect(soupPackCartSku(["to", "dy", "ku"])).toBe(soupPackCartSku(["dy", "ku", "to"]));
    expect(soupPackCartSku(["dy"])).toBeNull();
  });

  it("řádek v košíku a pokladně vypíše vybrané polévky", () => {
    const sku = soupPackCartSku(["dy", "ku", "gu"])!;
    expect(soupChoiceLine(sku)).toBe("Vaše polévky: Dýňová polévka, Kulajda a Gulášová polévka z hlívy ústřičné.");
    expect(choiceLine(sku)).toBe(soupChoiceLine(sku));
    const lines = resolveCartLines([{ sku, quantity: 1 }], index);
    expect(lines[0].lineTotalKc).toBe(299);
    expect(lines[0].name).toContain("(Dýňová polévka, Kulajda, Gulášová polévka z hlívy ústřičné)");
  });

  it("cena 299 Kč osobně, s chlazenou dopravou dražší; bez výběru ani Zásilkovnou ne", () => {
    const sku = soupPackCartSku(["dy", "ku", "to"])!;
    const pickup = priceCart([{ sku, quantity: 1 }], "osobni-odber", index);
    expect(pickup.ok && pickup.value.totalKc).toBe(299);
    const cold = priceCart([{ sku, quantity: 1 }], "rozvoz", index, { shippingMode: "weight" });
    expect(cold.ok && cold.value.totalKc).toBe(299 + 267);
    expect(priceCart([{ sku: SOUP_PACK_SKU, quantity: 1 }], "osobni-odber", index)).toEqual({ ok: false, error: SOUP_PACK_NEEDS_CHOICE });
    expect(priceCart([{ sku, quantity: 1 }], "zasilkovna", index, { zasilkovna: true })).toEqual({ ok: false, error: SOUP_PACK_NO_ZASILKOVNA });
  });

  it("dvě různé ochutnávky = dva řádky, jdou koupit opakovaně", () => {
    const a = soupPackCartSku(["dy", "ku", "to"])!;
    const b = soupPackCartSku(["rr", "gu", "sp"])!;
    const r = priceCart([{ sku: a, quantity: 2 }, { sku: b, quantity: 1 }], "osobni-odber", index);
    expect(r.ok && r.value.subtotalKc).toBe(3 * 299);
  });
});

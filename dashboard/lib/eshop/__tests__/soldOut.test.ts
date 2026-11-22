import { describe, expect, it } from "vitest";
import { createCatalogIndex } from "../catalogIndex";
import { priceCart } from "../pricing";
import { availableVariants, isSoldOut, lowestPriceKc } from "../productRules";
import { catalogIndex } from "./helpers/catalogFixture";

// Vyprodáno (Lucie 22. 11. 2026): sirupy 650 ml a koktejly 500 ml — chybí stříbrné kapsičky.
const base = catalogIndex.catalog;
const multi = base.products.find((product) => product.variants.length > 1)!;
const [keep, gone] = multi.variants;
const soldOutCatalog = {
  ...base,
  products: base.products.map((product) =>
    product.slug === multi.slug
      ? { ...product, variants: product.variants.map((v) => (v.sku === gone.sku ? { ...v, soldOut: true } : v)) }
      : product
  ),
};
const index = createCatalogIndex(soldOutCatalog);

describe("vyprodané balení", () => {
  it("nejde objednat ani podvrženým košíkem", () => {
    const result = priceCart([{ sku: gone.sku, quantity: 1 }], "osobni-odber", index);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("vyprodané");
  });

  it("ostatní balení téhož produktu jde koupit dál", () => {
    const result = priceCart([{ sku: keep.sku, quantity: 1 }], "osobni-odber", index);
    expect(result.ok).toBe(true);
  });

  it("„od … Kč“ počítá jen z nevyprodaných balení", () => {
    const product = index.getProduct(multi.slug)!;
    expect(lowestPriceKc(product)).toBe(Math.min(...product.variants.filter((v) => v.sku !== gone.sku).map((v) => v.priceKc)));
    expect(availableVariants(product).map((v) => v.sku)).toEqual(product.variants.filter((v) => v.sku !== gone.sku).map((v) => v.sku));
    expect(isSoldOut(product)).toBe(false);
  });

  it("produkt se všemi balením vyprodanými je celý vyprodaný", () => {
    expect(isSoldOut({ variants: multi.variants.map((v) => ({ ...v, soldOut: true })) })).toBe(true);
  });
});

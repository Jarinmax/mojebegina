import { describe, expect, it } from "vitest";
import { googleMerchantFeed, litres } from "../feeds";
import type { Catalog, Product } from "../types";

const base = {
  category: "sirupy",
  shortDescription: null,
  highlights: [],
  taste: null,
  warnings: [],
  alcoholPercent: null,
  isAgeRestricted: false,
  foodInfo: { allergens: [] },
} as const;
const sirup = {
  ...base,
  slug: "lipovy-sirup",
  name: "Lipový sirup",
  description: ["Lipový sirup je **jemný** & květinový.", "## Pro koho"],
  image: "/eshop/sirupy/lipovy.jpg",
  gallery: [{ url: "/eshop/sirupy/lipovy.jpg", alt: null }, { url: "/eshop/sirupy/lipovy-sacek.jpg", alt: null }],
  variants: [
    { sku: "lipovy-sirup-3l", label: "3 l", priceKc: 549, weightGrams: 3000, volumeMl: 3000 },
    { sku: "lipovy-sirup-750ml", label: "650 ml", priceKc: 199, weightGrams: 750, volumeMl: 650 },
  ],
} as unknown as Product;
const koktejl = { ...sirup, slug: "kosmopolitan", name: "Kosmopolitan", category: "koktejly", isAgeRestricted: true } as unknown as Product;
const blokovany = { ...sirup, slug: "x", name: "X", foodInfo: { allergens: null }, variants: [{ sku: "x-3l", label: "3 l", priceKc: 100, weightGrams: null }] } as unknown as Product;
const bezFotky = { ...sirup, slug: "y", name: "Y", image: null, gallery: [], variants: [{ sku: "y-3l", label: "3 l", priceKc: 100, weightGrams: null }] } as unknown as Product;
const catalog = { categories: [{ slug: "sirupy", name: "Bylinné sirupy" }], products: [sirup, koktejl, blokovany, bezFotky] } as unknown as Catalog;

describe("googleMerchantFeed", () => {
  const xml = googleMerchantFeed(catalog);
  it("položka za každé balení, cena v CZK, skupina variant, fotky absolutně", () => {
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml.match(/<item>/g)).toHaveLength(3);
    expect(xml).toContain("<g:id>lipovy-sirup-3l</g:id>");
    expect(xml).toContain("<g:title>Lipový sirup 650 ml</g:title>");
    expect(xml).toContain("<g:price>199.00 CZK</g:price>");
    expect(xml).toContain("<g:item_group_id>lipovy-sirup</g:item_group_id>");
    expect(xml).toContain("<g:image_link>https://begina.cz/eshop/sirupy/lipovy.jpg</g:image_link>");
    expect(xml).toContain("<g:additional_image_link>https://begina.cz/eshop/sirupy/lipovy-sacek.jpg</g:additional_image_link>");
    expect(xml).toContain("<g:shipping_weight>3000 g</g:shipping_weight>");
    expect(xml).toContain("<g:product_type>Bylinné sirupy</g:product_type>");
    expect(xml).toContain("<g:description>Lipový sirup je jemný &amp; květinový.</g:description>");
  });
  it("bez alkoholu a bez produktů bez fotky; neobjednatelné = out_of_stock", () => {
    expect(xml).not.toContain("kosmopolitan");
    expect(xml).not.toContain("y-3l");
    expect(xml).toMatch(/<g:id>x-3l<\/g:id>[\s\S]*?<g:availability>out_of_stock<\/g:availability>/);
    expect(xml).not.toMatch(/<g:shipping_weight>null/);
  });
  it("kategorie Google (nealko nápoje) a jednotková cena za litr", () => {
    expect(xml.match(/<g:google_product_category>Food, Beverages &amp; Tobacco &gt; Beverages<\/g:google_product_category>/g)).toHaveLength(3);
    expect(xml).not.toContain("Alcoholic");
    expect(xml).toContain("<g:unit_pricing_measure>3 l</g:unit_pricing_measure>");
    expect(xml).toContain("<g:unit_pricing_measure>0.65 l</g:unit_pricing_measure>");
    expect(xml.match(/<g:unit_pricing_base_measure>1 l<\/g:unit_pricing_base_measure>/g)).toHaveLength(2);
    expect(litres(500)).toBe("0.5 l");
    // balení bez známého objemu jednotkovou cenu nemá (nehádá se)
    expect(xml).toMatch(/<g:id>x-3l<\/g:id>(?:(?!<\/item>)[\s\S])*<\/item>/);
    expect(xml.match(/<g:id>x-3l<\/g:id>(?:(?!<\/item>)[\s\S])*/)![0]).not.toContain("unit_pricing_measure");
  });
});

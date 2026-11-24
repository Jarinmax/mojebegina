// ESHOP 1.0 — vyhledávání v katalogu načteném z DB. Čisté funkce, běží
// na serveru i v prohlížeči (CatalogProvider).

import { baseSku, choiceFromSku, isSetSku } from "./tastingSet";
import { soupChoiceFromSku, soupPackBaseSku } from "./soupPack";
import type { Catalog, Category, Product, Variant } from "./types";

export type CatalogIndex = {
  catalog: Catalog;
  findCategory(slug: string): Category | undefined;
  productsInCategory(slug: string): Product[];
  getProduct(slug: string): Product | undefined;
  getVariant(sku: string): { product: Product; variant: Variant } | undefined;
};

export function createCatalogIndex(catalog: Catalog): CatalogIndex {
  const productsBySlug = new Map(catalog.products.map((product) => [product.slug, product]));
  const variantsBySku = new Map<string, { product: Product; variant: Variant }>();
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      variantsBySku.set(variant.sku, { product, variant });
    }
  }
  return {
    catalog,
    findCategory: (slug) => catalog.categories.find((category) => category.slug === slug),
    productsInCategory: (slug) => catalog.products.filter((product) => product.category === slug),
    getProduct: (slug) => productsBySlug.get(slug),
    // Ochutnávkový set: řádek košíku nese výběr sirupů jako příponu SKU
    // („…~sa.li.za.ib.si“, tastingSet.ts) — balení se hledá bez přípony;
    // přípona s neplatným výběrem = neznámé balení.
    getVariant: (sku) => {
      const direct = variantsBySku.get(sku);
      if (direct) return direct;
      // Ochutnávka polévek 3 × 450 ml: stejný princip (soupPack.ts)
      if (soupChoiceFromSku(sku) !== null) return variantsBySku.get(soupPackBaseSku(sku));
      if (!isSetSku(sku) || choiceFromSku(sku) === null) return direct;
      return variantsBySku.get(baseSku(sku));
    },
  };
}

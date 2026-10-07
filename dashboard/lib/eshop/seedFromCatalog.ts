// ESHOP 1.0 — převod lib/eshop/catalog.ts na řádky DB pro první naplnění
// (migrace 0014, generuje scripts/eshop-seed/generate-seed-sql.ts)
// a očekávaný katalog, který musí DB po naplnění vrátit (test parity).
//
// catalog.ts se za běhu e-shopu nepoužívá — jen tady.

import { categories as seedCategories, products as seedProducts } from "./catalog";
import type { Catalog } from "./types";

// Objem a počet nápojů nejsou v catalog.ts samostatně — odvozují se
// z názvu balení ("3 l …", "500 ml …") a poznámky ("Až 15 nápojů …").
export function deriveVolumeMl(label: string | null): number | null {
  if (!label) return null;
  const liters = /^(\d+(?:,\d+)?)\s*l\b/.exec(label);
  if (liters) return Math.round(parseFloat(liters[1].replace(",", ".")) * 1000);
  const ml = /^(\d+)\s*ml\b/.exec(label);
  return ml ? Number(ml[1]) : null;
}

export function deriveServings(detail: string | null): number | null {
  const match = detail ? /^Až (\d+) nápojů/.exec(detail) : null;
  return match ? Number(match[1]) : null;
}

function assertNoUnmappedFoodData() {
  for (const product of seedProducts) {
    // catalog.ts má alergeny i výživové hodnoty jako volný text, DB kódy
    // a strukturovaný JSON — pokud se v catalog.ts objeví, musí se doplnit
    // přímo do DB, ne odhadem převádět.
    if (product.foodInfo.allergens !== null || product.foodInfo.nutritionPer100g !== null) {
      throw new Error(`catalog.ts: ${product.slug} má alergeny/výživové hodnoty — doplňte je v DB.`);
    }
  }
}

export function seedRows() {
  assertNoUnmappedFoodData();
  const ageRestrictedCategories = new Set(seedCategories.filter((c) => c.ageRestricted).map((c) => c.slug));

  const categories = seedCategories.map((category, index) => ({
    slug: category.slug,
    name: category.name,
    intro: category.intro,
    detailSections: category.detailSections.length > 0 ? category.detailSections : null,
    imageUrl: category.image,
    sortOrder: (index + 1) * 10,
  }));

  const perCategory = new Map<string, number>();
  const products = seedProducts.map((product) => {
    const position = (perCategory.get(product.category) ?? 0) + 1;
    perCategory.set(product.category, position);
    return {
      categorySlug: product.category,
      slug: product.slug,
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      highlights: product.highlights,
      tasteDescription: product.taste,
      ingredients: product.foodInfo.ingredients,
      storageInstructions: product.foodInfo.storage,
      shelfLifeNote: product.foodInfo.shelfLife,
      alcoholPercent: product.alcoholPercent,
      isAgeRestricted: ageRestrictedCategories.has(product.category),
      warnings: product.warnings,
      sortOrder: position * 10,
    };
  });

  const variants = seedProducts.flatMap((product) =>
    product.variants.map((variant, index) => ({
      productSlug: product.slug,
      sku: variant.sku,
      label: variant.label,
      shortNote: variant.detail,
      packageDescription: variant.description,
      volumeMl: deriveVolumeMl(variant.label),
      servings: deriveServings(variant.detail),
      priceB2cKc: variant.priceKc,
      sortOrder: (index + 1) * 10,
    }))
  );

  const images = seedProducts.flatMap((product) =>
    product.image ? [{ productSlug: product.slug, url: product.image, alt: product.name, sortOrder: 0 }] : []
  );

  return { categories, products, variants, images };
}

/** Katalog, který musí loadCatalog() vrátit po naplnění DB migrací 0014. */
export function expectedCatalogAfterSeed(): Catalog {
  const rows = seedRows();
  const productList = seedProducts.map((product) => {
    const row = rows.products.find((p) => p.slug === product.slug)!;
    return {
      slug: product.slug,
      name: product.name,
      category: product.category,
      shortDescription: product.shortDescription,
      highlights: product.highlights,
      description: product.description,
      taste: product.taste,
      warnings: product.warnings,
      image: product.image,
      variants: product.variants.map((variant) => ({
        sku: variant.sku,
        label: variant.label,
        detail: variant.detail,
        description: variant.description,
        priceKc: variant.priceKc,
        volumeMl: deriveVolumeMl(variant.label),
        servings: deriveServings(variant.detail),
      })),
      alcoholPercent: product.alcoholPercent,
      isAgeRestricted: row.isAgeRestricted,
      foodInfo: { ...product.foodInfo },
    };
  });
  return {
    categories: seedCategories.map((category) => ({
      slug: category.slug,
      name: category.name,
      image: category.image,
      intro: category.intro,
      detailSections: category.detailSections,
      ageRestricted: productList.some((p) => p.category === category.slug && p.isAgeRestricted),
    })),
    products: productList,
  };
}

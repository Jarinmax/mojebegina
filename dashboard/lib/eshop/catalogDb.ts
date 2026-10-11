// ESHOP 1.0 — načtení katalogu z DB. Jediný zdroj katalogu pro e-shop.
//
// Přijímá databázi jako parametr (neon-http v aplikaci, PGlite v testech),
// takže stejný kód ověřují integrační testy proti skutečným migracím.
// Čte jen aktivní kategorie, produkty a balení; produkt bez aktivního
// balení se nezobrazí (nejde koupit).
//
// Hmotnosti balení (sloupec weight_g, migrace 0021) se čtou samostatným
// dotazem jen s { weights: true } (ESHOP_WEIGHT_SHIPPING=on). Když sloupec
// ještě neexistuje (migrace neproběhla), katalog funguje dál a hmotnosti
// jsou null → chlazená přeprava podle hmotnosti se nenabídne.

import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { allergenLabel } from "./allergens";
import { formatNutrition } from "./nutrition";
import type { Catalog, Category, DetailSection, Product, Variant } from "./types";

type CatalogDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const { productCategories, products, productVariants, productImages } = schema;

function parseDetailSections(raw: unknown): DetailSection[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((section) => {
    if (typeof section !== "object" || section === null) {
      return [];
    }
    const { title, paragraphs, bullets } = section as Record<string, unknown>;
    const strings = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return typeof title === "string" ? [{ title, paragraphs: strings(paragraphs), bullets: strings(bullets) }] : [];
  });
}

/** Postgres „undefined_column“ (i zabalený v DrizzleQueryError.cause). */
function isMissingColumn(error: unknown): boolean {
  for (let e = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "42703") return true;
  }
  return false;
}

async function loadWeights<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof schema> | CatalogDb
): Promise<Map<string, number | null>> {
  try {
    const rows = await db
      .select({ sku: productVariants.sku, weightG: productVariants.weightG })
      .from(productVariants)
      .where(eq(productVariants.isActive, true));
    return new Map(rows.map((row) => [row.sku, row.weightG]));
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    console.warn("E-shop: sloupec product_variants.weight_g chybí (migrace 0021) — chlazená přeprava podle hmotnosti nedostupná.");
    return new Map();
  }
}

export async function loadCatalog<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof schema> | CatalogDb,
  options: { weights?: boolean } = {}
): Promise<Catalog> {
  const [categoryRows, productRows, variantRows, imageRows, weights] = await Promise.all([
    db
      .select()
      .from(productCategories)
      .where(eq(productCategories.isActive, true))
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.slug)),
    db
      .select()
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.sortOrder), asc(products.slug)),
    // Výčet sloupců bez weight_g: katalog musí fungovat i před migrací 0021.
    db
      .select({
        productId: productVariants.productId,
        sku: productVariants.sku,
        label: productVariants.label,
        shortNote: productVariants.shortNote,
        packageDescription: productVariants.packageDescription,
        priceB2cKc: productVariants.priceB2cKc,
        volumeMl: productVariants.volumeMl,
        servings: productVariants.servings,
      })
      .from(productVariants)
      .where(eq(productVariants.isActive, true))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.sku)),
    db.select().from(productImages).orderBy(asc(productImages.sortOrder), asc(productImages.createdAt)),
    options.weights ? loadWeights(db) : Promise.resolve(new Map<string, number | null>()),
  ]);

  const categorySlugById = new Map(categoryRows.map((row) => [row.id, row.slug]));

  const variantsByProduct = new Map<string, Variant[]>();
  for (const row of variantRows) {
    const list = variantsByProduct.get(row.productId) ?? [];
    list.push({
      sku: row.sku,
      label: row.label,
      detail: row.shortNote,
      description: row.packageDescription,
      priceKc: row.priceB2cKc,
      volumeMl: row.volumeMl,
      servings: row.servings,
      weightGrams: weights.get(row.sku) ?? null,
    });
    variantsByProduct.set(row.productId, list);
  }

  const mainImageByProduct = new Map<string, string>();
  for (const row of imageRows) {
    if (!mainImageByProduct.has(row.productId)) {
      mainImageByProduct.set(row.productId, row.url);
    }
  }

  const productList: Product[] = productRows.flatMap((row) => {
    const category = categorySlugById.get(row.categoryId);
    const variants = variantsByProduct.get(row.id) ?? [];
    if (!category || variants.length === 0) {
      return [];
    }
    return [
      {
        slug: row.slug,
        name: row.name,
        category,
        shortDescription: row.shortDescription,
        highlights: row.highlights,
        description: row.description,
        taste: row.tasteDescription,
        warnings: row.warnings,
        image: mainImageByProduct.get(row.id) ?? null,
        variants,
        alcoholPercent: row.alcoholPercent,
        isAgeRestricted: row.isAgeRestricted,
        foodInfo: {
          ingredients: row.ingredients,
          allergens: row.allergens === null ? null : row.allergens.map(allergenLabel),
          nutritionPer100g: formatNutrition(row.nutrition, row.nutritionBasis),
          storage: row.storageInstructions,
          shelfLife: row.shelfLifeNote,
        },
      },
    ];
  });

  // sort_order produktu platí uvnitř kategorie → řadit podle pořadí
  // kategorie (Array.sort je stabilní, pořadí z DB uvnitř kategorie zůstává).
  const categoryPosition = new Map(categoryRows.map((row, index) => [row.slug, index]));
  productList.sort((a, b) => categoryPosition.get(a.category)! - categoryPosition.get(b.category)!);

  const categories: Category[] = categoryRows.map((row) => ({
    slug: row.slug,
    name: row.name,
    image: row.imageUrl,
    intro: row.intro,
    detailSections: parseDetailSections(row.detailSections),
    ageRestricted: productList.some((product) => product.category === row.slug && product.isAgeRestricted),
  }));

  return { categories, products: productList };
}

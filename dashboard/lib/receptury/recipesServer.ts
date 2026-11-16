// RECEPTURY A NÁKLADY 1.0 — čtení receptur a ceníku, změna ceny. Volající
// MUSÍ předem ověřit isInvoiceIssuer (jen Jaroslav a Lucie).
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { recipeIngredients, recipeItems, recipeVariants, recipes } from "@/lib/db/schema";
import type { ItemUnit, PriceUnit, Recipe, RecipeIngredient } from "./recipes";

/** false = tabulky v databázi ještě nejsou (skript 123 nebyl spuštěn). */
export async function recipeTablesExist(): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('public.recipes') IS NOT NULL AS present`);
  const row = (result.rows?.[0] ?? null) as { present?: boolean } | null;
  return row?.present === true;
}

export async function loadIngredients(): Promise<RecipeIngredient[]> {
  const rows = await db.select().from(recipeIngredients).orderBy(asc(recipeIngredients.name));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind === "obal" ? "obal" : "surovina",
    code: row.code,
    name: row.name,
    priceUnit: row.priceUnit as PriceUnit,
    priceKc: Number(row.priceKc),
    note: row.note,
  }));
}

export async function loadRecipes(): Promise<{ recipes: Recipe[]; ingredients: RecipeIngredient[] }> {
  const [ingredients, recipeRows, itemRows, variantRows] = await Promise.all([
    loadIngredients(),
    db.select().from(recipes).orderBy(asc(recipes.sort), asc(recipes.name)),
    db.select().from(recipeItems).orderBy(asc(recipeItems.sort)),
    db.select().from(recipeVariants).orderBy(asc(recipeVariants.sort)),
  ]);
  const byId = new Map(ingredients.map((item) => [item.id, item]));
  return {
    ingredients,
    recipes: recipeRows.map((row) => ({
      slug: row.slug,
      category: row.category,
      name: row.name,
      batchMl: row.batchMl,
      note: row.note,
      archived: row.archived,
      items: itemRows
        .filter((item) => item.recipeId === row.id && byId.has(item.ingredientId))
        .map((item) => ({ ingredient: byId.get(item.ingredientId)!, quantity: Number(item.quantity), unit: item.unit as ItemUnit })),
      variants: variantRows
        .filter((variant) => variant.recipeId === row.id)
        .map((variant) => ({
          label: variant.label,
          volumeMl: variant.volumeMl,
          packagingCodes: variant.packagingCodes.split(",").map((code) => code.trim()).filter(Boolean),
          salePriceHal: variant.salePriceHal,
        })),
    })),
  };
}

export function packagingPrices(ingredients: RecipeIngredient[]): Map<string, number> {
  return new Map(ingredients.filter((item) => item.kind === "obal").map((item) => [item.code, item.priceKc]));
}

export async function updateIngredientPrice(id: string, priceKc: number, note: string | null, userId: string): Promise<void> {
  await db
    .update(recipeIngredients)
    .set({ priceKc: priceKc.toFixed(4), note, updatedByUserId: userId, updatedAt: new Date() })
    .where(eq(recipeIngredients.id, id));
}

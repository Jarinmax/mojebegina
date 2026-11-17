// RECEPTURY A NÁKLADY 1.0 — čtení receptur a ceníku, změna ceny. Volající
// MUSÍ předem ověřit isInvoiceIssuer (jen Jaroslav a Lucie).
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { recipeIngredients, recipeItems, recipeOffers, recipeVariants, recipes } from "@/lib/db/schema";
import type { ItemUnit, PriceUnit, Recipe, RecipeIngredient, RecipeOffer } from "./recipes";

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

// NÁKUPY SUROVIN 1.0 — nabídky dodavatelů s odkazy.

/** false = tabulka nabídek ještě není (skript 128 nebyl spuštěn). */
export async function offerTableExists(): Promise<boolean> {
  const result = await db.execute(sql`SELECT to_regclass('public.recipe_offers') IS NOT NULL AS present`);
  const row = (result.rows?.[0] ?? null) as { present?: boolean } | null;
  return row?.present === true;
}

export async function loadOffers(): Promise<RecipeOffer[]> {
  if (!(await offerTableExists())) return [];
  const rows = await db.select().from(recipeOffers).orderBy(asc(recipeOffers.sort), asc(recipeOffers.itemName));
  return rows.map((row) => ({
    id: row.id,
    ingredientId: row.ingredientId,
    itemName: row.itemName,
    url: row.url,
    packLabel: row.packLabel,
    packQty: Number(row.packQty),
    priceKc: Number(row.priceKc),
    shippingKc: Number(row.shippingKc),
    isPromo: row.isPromo,
    note: row.note,
  }));
}

export type OfferInput = Omit<RecipeOffer, "id">;

/** Nová nabídka (id = null) nebo úprava existující. Vrací id, nebo null když id neexistuje. */
export async function saveOffer(id: string | null, input: OfferInput, userId: string): Promise<string | null> {
  const values = {
    ingredientId: input.ingredientId,
    itemName: input.itemName,
    url: input.url,
    packLabel: input.packLabel,
    packQty: input.packQty.toFixed(4),
    priceKc: input.priceKc.toFixed(2),
    shippingKc: input.shippingKc.toFixed(2),
    isPromo: input.isPromo,
    note: input.note,
    updatedByUserId: userId,
    updatedAt: new Date(),
  };
  if (id) {
    const rows = await db.update(recipeOffers).set(values).where(eq(recipeOffers.id, id)).returning({ id: recipeOffers.id });
    return rows[0]?.id ?? null;
  }
  const rows = await db.insert(recipeOffers).values(values).returning({ id: recipeOffers.id });
  return rows[0]?.id ?? null;
}

export async function deleteOffer(id: string): Promise<boolean> {
  const rows = await db.delete(recipeOffers).where(eq(recipeOffers.id, id)).returning({ id: recipeOffers.id });
  return rows.length > 0;
}

"use server";

import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { parseBatchCount } from "@/lib/receptury/recipes";
import { loadRecipes } from "@/lib/receptury/recipesServer";
import { closeRun, createRun, getRunProgress, setRunMark, type RunProgress } from "@/lib/receptury/productionRuns";

async function allowed() {
  const ctx = await getAuthContext();
  return ctx && isInvoiceIssuer(ctx) ? ctx : null;
}

export async function startRunAction(formData: FormData): Promise<void> {
  const ctx = await allowed();
  if (!ctx) throw new Error("Nemáš oprávnění.");
  const slug = String(formData.get("slug") ?? "");
  const count = parseBatchCount(String(formData.get("beginy") ?? "1"));
  const { recipes } = await loadRecipes();
  const recipe = recipes.find((r) => r.slug === slug);
  if (!recipe) throw new Error("Recept nenalezen.");
  const id = await createRun({
    recipeSlug: recipe.slug,
    recipeName: recipe.name,
    category: recipe.category,
    batchCount: count,
    batchMl: recipe.batchMl,
    items: recipe.items.map((i) => ({ name: i.ingredient.name, quantity: i.quantity, unit: i.unit })),
    steps: recipe.procedureSteps ?? [],
    checks: recipe.procedureChecks ?? [],
    userId: ctx.userId,
    userName: ctx.name,
  });
  redirect(`/rizeni-firmy/recepty/varka/${id}`);
}

export async function setMarkAction(id: string, kind: "item" | "step", index: number, done: boolean): Promise<RunProgress | null> {
  if (!(await allowed())) return null;
  return setRunMark(id, kind, index, done);
}

export async function progressAction(id: string): Promise<RunProgress | null> {
  if (!(await allowed())) return null;
  return getRunProgress(id);
}

export async function closeRunAction(formData: FormData): Promise<void> {
  if (!(await allowed())) throw new Error("Nemáš oprávnění.");
  const id = String(formData.get("id") ?? "");
  const how = formData.get("how") === "cancel" ? "cancel" : "finish";
  await closeRun(id, how);
  redirect(how === "finish" ? `/rizeni-firmy/recepty/varka/${id}` : "/rizeni-firmy/recepty");
}

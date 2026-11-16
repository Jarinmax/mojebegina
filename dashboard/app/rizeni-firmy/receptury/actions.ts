"use server";

// RECEPTURY A NÁKLADY 1.0 — změna ceny suroviny nebo obalu. Jen Jaroslav
// a Lucie (isInvoiceIssuer).
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { parsePriceKc } from "@/lib/receptury/recipes";
import { updateIngredientPrice } from "@/lib/receptury/recipesServer";

export type PriceActionState = { error: string } | { success: string } | null;

export async function updateIngredientPriceAction(_prev: PriceActionState, formData: FormData): Promise<PriceActionState> {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) return { error: "Ceník smí upravovat jen Jaroslav Viner a Lucie Königsbergová." };
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Neznámá položka ceníku." };
  const priceKc = parsePriceKc(String(formData.get("price") ?? ""));
  if (priceKc === null) return { error: "Cena musí být číslo, například 44,32." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  await updateIngredientPrice(id, priceKc, note, ctx.userId);
  revalidatePath("/rizeni-firmy/receptury", "layout");
  return { success: "Uloženo, receptury jsou přepočítané." };
}

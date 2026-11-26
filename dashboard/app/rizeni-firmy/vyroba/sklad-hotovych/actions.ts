"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getAuthContext } from "@/lib/data/authContext";
import { canConfirmGoodsReceipt } from "@/lib/data/skladAuth";
import { adjustVariantStock } from "@/lib/eshop/variantStock";

export type AdjustState = { error?: string; success?: string } | null;

/** Odpis / doplnění hlídaných kusů (vzorek, prodej v bistru, inventura) — vždy s důvodem. */
export async function adjustStockAction(_prev: AdjustState, form: FormData): Promise<AdjustState> {
  const ctx = await getAuthContext();
  if (!ctx || !canConfirmGoodsReceipt(ctx)) return { error: "Odepisovat smí jen Jaroslav Viner, Lucie Königsbergová a Jaroslav Blahout." };
  const sku = String(form.get("sku") ?? "");
  const mode = String(form.get("mode") ?? "minus");
  const amount = Number(form.get("amount"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (!sku) return { error: "Chybí balení." };
  if (!Number.isInteger(amount) || amount < (mode === "set" ? 0 : 1)) return { error: "Zadejte počet kusů (celé číslo)." };
  if (!reason) return { error: "Napište důvod (např. vzorek pro kavárnu, prodej v bistru)." };
  const result = await adjustVariantStock(db, {
    sku,
    ...(mode === "set" ? { setTo: amount } : { change: mode === "plus" ? amount : -amount }),
    reason,
    userId: ctx.userId,
    userName: ctx.name,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/rizeni-firmy/vyroba/sklad-hotovych");
  return { success: `${result.row.product} ${result.row.label ?? ""}: skladem ${result.row.stockQty} ks${result.row.soldOut ? " (vyprodáno)" : ""}.` };
}

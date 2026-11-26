"use server";

// POKLADNA BISTRA — serverové akce (prodej, storno, menu, uzávěrka).
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/data/authContext";
import { canManagePos, canUsePos, POS_DENIED, POS_MANAGE_DENIED } from "@/lib/pokladna/posAuth";
import { isPaymentMethod, parsePriceToHal } from "@/lib/pokladna/pos";
import { cancelReceipt, closeDay, createReceipt, saveItem, setEconomySync, setItemActive, syncMonthToEconomy, todayPrague } from "@/lib/pokladna/posServer";

export type SaleResult = { ok: true; id: string } | { ok: false; error: string };

export async function createReceiptAction(input: {
  lines: Array<{ itemId: string; quantity: number }>;
  paymentMethod: string;
  cashGivenHal: number | null;
  note: string;
}): Promise<SaleResult> {
  const ctx = await getAuthContext();
  if (!ctx || !canUsePos(ctx)) return { ok: false, error: POS_DENIED };
  if (!isPaymentMethod(input.paymentMethod)) return { ok: false, error: "Vyberte způsob platby." };
  const cashGivenHal = input.cashGivenHal !== null && Number.isSafeInteger(input.cashGivenHal) && input.cashGivenHal >= 0 ? input.cashGivenHal : null;
  const result = await createReceipt({
    lines: Array.isArray(input.lines) ? input.lines.map((l) => ({ itemId: String(l.itemId), quantity: Number(l.quantity) })) : [],
    paymentMethod: input.paymentMethod,
    cashGivenHal,
    note: input.note?.trim().slice(0, 300) || null,
    cashierUserId: ctx.userId,
    cashierName: ctx.name,
  });
  if (!result.ok) return result;
  revalidatePath("/rizeni-firmy/pokladna");
  return { ok: true, id: result.id };
}

export type FormState = { error?: string; success?: string } | null;

export async function cancelReceiptAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx || !canUsePos(ctx)) return { error: POS_DENIED };
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Chybí účtenka." };
  if (!reason) return { error: "Napište důvod storna." };
  const result = await cancelReceipt(id, reason, ctx.name);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/rizeni-firmy/pokladna/uctenka/${id}`);
  revalidatePath("/rizeni-firmy/pokladna/uzaverka");
  return { success: "Účtenka stornována." };
}

export async function saveItemAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx || !canManagePos(ctx)) return { error: POS_MANAGE_DENIED };
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const category = String(form.get("category") ?? "").trim().slice(0, 60);
  const priceHal = parsePriceToHal(String(form.get("price") ?? ""));
  const sortOrder = Number(form.get("sortOrder") ?? 0);
  if (!name) return { error: "Vyplňte název." };
  if (!category) return { error: "Vyplňte kategorii." };
  if (priceHal === null) return { error: "Cena musí být číslo, například 89 nebo 49,50." };
  await saveItem({ id: /^[0-9a-f-]{36}$/i.test(id) ? id : undefined, name, category, priceHal, sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0 });
  revalidatePath("/rizeni-firmy/pokladna", "layout");
  return { success: id ? "Uloženo." : `Přidáno: ${name}.` };
}

export async function toggleItemAction(form: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx || !canManagePos(ctx)) return;
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await setItemActive(id, form.get("active") === "on");
  revalidatePath("/rizeni-firmy/pokladna", "layout");
}

export async function closeDayAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx || !canUsePos(ctx)) return { error: POS_DENIED };
  const countedRaw = String(form.get("cashCounted") ?? "").trim();
  const cashCountedHal = countedRaw ? parsePriceToHal(countedRaw) : null;
  if (countedRaw && cashCountedHal === null) return { error: "Hotovost v kase musí být číslo." };
  const result = await closeDay({ businessDate: todayPrague(), cashCountedHal, note: String(form.get("note") ?? "").trim().slice(0, 300) || null, byName: ctx.name });
  if (!result.ok) return { error: result.error };
  revalidatePath("/rizeni-firmy/pokladna/uzaverka");
  revalidatePath("/rizeni-firmy/ekonomika");
  return { success: result.synced ? "Den uzavřen a tržby zapsány do Financí." : "Den uzavřen. Zápis do Financí je vypnutý (souběh se Storyous)." };
}

export async function toggleSyncAction(form: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx || !canManagePos(ctx)) return;
  const on = form.get("on") === "on";
  await setEconomySync(on, ctx.name);
  if (on) await syncMonthToEconomy(todayPrague().slice(0, 7));
  revalidatePath("/rizeni-firmy/pokladna/uzaverka");
  revalidatePath("/rizeni-firmy/ekonomika");
}

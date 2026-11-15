"use server";

// EKONOMIKA 1.0 — zápis a smazání příjmu/nákladu. Jen Jaroslav a Lucie
// (isInvoiceIssuer) — nikdo jiný z vedení ani obchodu.
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { parseAmountToHal, parseEntryDate, type EconomyKind } from "@/lib/ekonomika/economy";
import { insertEconomyEntry, softDeleteEconomyEntry } from "@/lib/ekonomika/economyServer";

export type EconomyActionState = { error: string } | { success: string } | null;

const DENIED = "Ekonomiku smí vidět a upravovat jen Jaroslav Viner a Lucie Königsbergová.";

async function requireOwner() {
  const ctx = await getAuthContext();
  return ctx && isInvoiceIssuer(ctx) ? ctx : null;
}

const optional = (formData: FormData, name: string) => {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value.slice(0, 500) : null;
};

export async function addEconomyEntryAction(_prev: EconomyActionState, formData: FormData): Promise<EconomyActionState> {
  const ctx = await requireOwner();
  if (!ctx) return { error: DENIED };
  const kind: EconomyKind = formData.get("kind") === "income" ? "income" : "cost";
  const entryDate = parseEntryDate(String(formData.get("entryDate") ?? ""));
  if (!entryDate) return { error: "Vyplňte datum (například 15. 11. 2026)." };
  const title = optional(formData, "title");
  if (!title) return { error: kind === "cost" ? "Vyplňte, co se kupovalo." : "Vyplňte, za co příjem je." };
  const amountHal = parseAmountToHal(String(formData.get("amount") ?? ""));
  if (amountHal === null) return { error: "Částka musí být kladné číslo, například 1 250 nebo 349,90." };
  const noShippingRaw = String(formData.get("amountNoShipping") ?? "").trim();
  const amountNoShippingHal = noShippingRaw ? parseAmountToHal(noShippingRaw) : null;
  if (noShippingRaw && amountNoShippingHal === null) return { error: "Cena bez dopravy musí být kladné číslo." };

  await insertEconomyEntry({
    kind,
    entryDate,
    title,
    counterparty: optional(formData, "counterparty"),
    amountHal,
    amountNoShippingHal,
    paymentForm: optional(formData, "paymentForm"),
    invoiceNumber: optional(formData, "invoiceNumber"),
    note: optional(formData, "note"),
    createdByUserId: ctx.userId,
  });
  revalidatePath("/rizeni-firmy/ekonomika");
  return { success: kind === "cost" ? "Náklad zapsán." : "Příjem zapsán." };
}

export async function deleteEconomyEntryAction(formData: FormData): Promise<void> {
  const ctx = await requireOwner();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await softDeleteEconomyEntry(id);
  revalidatePath("/rizeni-firmy/ekonomika");
}

"use server";

// RECEPTURY A NÁKLADY 1.0 — změna ceny suroviny nebo obalu; NÁKUPY SUROVIN
// 1.0 — nabídky dodavatelů s odkazy. Jen Jaroslav a Lucie (isInvoiceIssuer).
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { offerUnitPriceKc, parsePriceKc, safeOfferUrl } from "@/lib/receptury/recipes";
import { deleteOffer, loadOffers, saveOffer, updateIngredientPrice } from "@/lib/receptury/recipesServer";

export type PriceActionState = { error: string } | { success: string } | null;

const DENIED = { error: "Ceník smí upravovat jen Jaroslav Viner a Lucie Königsbergová." };
const UUID_RE = /^[0-9a-f-]{36}$/i;

async function issuer() {
  const ctx = await getAuthContext();
  return ctx && isInvoiceIssuer(ctx) ? ctx : null;
}

function done(message: string): PriceActionState {
  revalidatePath("/rizeni-firmy/receptury", "layout");
  return { success: message };
}

export async function updateIngredientPriceAction(_prev: PriceActionState, formData: FormData): Promise<PriceActionState> {
  const ctx = await issuer();
  if (!ctx) return DENIED;
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { error: "Neznámá položka ceníku." };
  const priceKc = parsePriceKc(String(formData.get("price") ?? ""));
  if (priceKc === null) return { error: "Cena musí být číslo, například 44,32." };
  await updateIngredientPrice(id, priceKc, null, ctx.userId);
  return done("Uloženo, receptury jsou přepočítané.");
}

/** Cena v ceníku = cena za jednotku vybrané nabídky (včetně dopravy). */
export async function applyOfferPriceAction(_prev: PriceActionState, formData: FormData): Promise<PriceActionState> {
  const ctx = await issuer();
  if (!ctx) return DENIED;
  const offerId = String(formData.get("offerId") ?? "");
  const offer = (await loadOffers()).find((item) => item.id === offerId);
  if (!offer || !offer.ingredientId) return { error: "Nabídka nenalezena." };
  await updateIngredientPrice(offer.ingredientId, offerUnitPriceKc(offer), null, ctx.userId);
  return done("Počítá se touto nabídkou, receptury jsou přepočítané.");
}

export async function saveOfferAction(_prev: PriceActionState, formData: FormData): Promise<PriceActionState> {
  const ctx = await issuer();
  if (!ctx) return DENIED;
  const rawId = String(formData.get("offerId") ?? "");
  const id = UUID_RE.test(rawId) ? rawId : null;
  const rawIngredient = String(formData.get("ingredientId") ?? "");
  const ingredientId = UUID_RE.test(rawIngredient) ? rawIngredient : null;
  const itemName = String(formData.get("itemName") ?? "").trim().slice(0, 200);
  const packLabel = String(formData.get("packLabel") ?? "").trim().slice(0, 60);
  const rawUrl = String(formData.get("url") ?? "").trim();
  const url = safeOfferUrl(rawUrl);
  const packQty = parsePriceKc(String(formData.get("packQty") ?? ""));
  const priceKc = parsePriceKc(String(formData.get("priceKc") ?? ""));
  const shippingKc = parsePriceKc(String(formData.get("shippingKc") ?? "") || "0");
  if (!itemName) return { error: "Vyplňte název nabídky." };
  if (!packLabel) return { error: "Vyplňte balení, například 5 kg." };
  if (rawUrl && !url) return { error: "Odkaz musí začínat https://" };
  if (packQty === null || packQty <= 0) return { error: "Množství v balení musí být kladné číslo." };
  if (priceKc === null) return { error: "Cena musí být číslo, například 1 164." };
  if (shippingKc === null) return { error: "Doprava musí být číslo (nebo prázdná)." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  const saved = await saveOffer(id, { ingredientId, itemName, url, packLabel, packQty, priceKc, shippingKc, isPromo: formData.get("isPromo") === "on", note }, ctx.userId);
  if (!saved) return { error: "Nabídka nenalezena." };
  return done("Nabídka uložená.");
}

export async function deleteOfferAction(_prev: PriceActionState, formData: FormData): Promise<PriceActionState> {
  const ctx = await issuer();
  if (!ctx) return DENIED;
  const id = String(formData.get("offerId") ?? "");
  if (!UUID_RE.test(id) || !(await deleteOffer(id))) return { error: "Nabídka nenalezena." };
  return done("Nabídka smazaná.");
}

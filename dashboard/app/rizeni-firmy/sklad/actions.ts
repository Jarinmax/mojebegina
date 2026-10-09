"use server";

// Sklad 1.0 (mobilní tok) — "use server" hranice pro založení draft
// příjemky, stejný princip jako app/rizeni-firmy/obchod/actions.ts: logika
// žije v lib/data/sklad.ts, tahle akce jen validuje formulář a přesměruje.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createDraftGoodsReceipt,
  createStockItem,
  createSupplier,
  reviewGoodsReceiptLineVat,
  updateGoodsReceiptLine,
} from "@/lib/data/sklad";
import { confirmGoodsReceiptLineMapping, triggerGoodsReceiptExtraction } from "@/lib/data/skladExtraction";
import type { ManualLineInput } from "@/lib/data/skladValidation";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

export type ActionState = { error: string } | null;

// Společný překlad Forbidden/Unauthenticated na českou hlášku pro akce
// volané přímo jako funkce (ne přes <form action>) — stejný důvod jako u
// createSupplierForReceiptAction výš: bez tohohle by neoprávněný uživatel
// (typicky Jiří Střelec, co na stránky vidí jen díky
// requirePricesAndOriginalAccess) dostal nezachycenou výjimku místo
// srozumitelné zprávy.
function translateAuthError(error: unknown, forbiddenMessage: string): { ok: false; error: string } {
  if (error instanceof UnauthenticatedError) {
    return { ok: false, error: "Nepřihlášeno." };
  }
  if (error instanceof ForbiddenError) {
    return { ok: false, error: forbiddenMessage };
  }
  throw error;
}

export async function createDraftGoodsReceiptAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const documentNumber = String(formData.get("documentNumber") ?? "").trim();
  const documentDate = String(formData.get("documentDate") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();

  const result = await createDraftGoodsReceipt({
    supplierId: String(formData.get("supplierId") ?? ""),
    stockLocationId: String(formData.get("stockLocationId") ?? ""),
    documentNumber: documentNumber || null,
    documentDate: documentDate || null,
    dueDate: dueDate || null,
    paymentMethod: paymentMethod || null,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/rizeni-firmy/sklad");
  redirect(`/rizeni-firmy/sklad/prijemky/${result.receiptId}`);
}

export type CreateSupplierActionResult = { ok: true; supplierId: string } | { ok: false; error: string };

// Volané přímo jako funkce z NovaPrijemkaForm (ne přes <form action>), aby
// formulář mohl po úspěchu nového dodavatele rovnou vybrat a zbytek
// rozepsané příjemky nechat beze změny — bez redirectu/reloadu stránky.
// Stejná datová funkce a stejný auth gate (requireReviewAccess) jako
// kdekoli jinde ve skladu — createSupplier si ho vynucuje sama. ctx bez
// requireReviewAccess (např. Jiří Střelec, co na nova-prijemka vidí jen
// díky requirePricesAndOriginalAccess) dostane srozumitelnou českou
// hlášku místo nezachycené výjimky (ta by se jinak projevila jako
// nepopsaná chyba serverové akce).
export async function createSupplierForReceiptAction(input: {
  name: string;
  ico: string;
  dic: string;
}): Promise<CreateSupplierActionResult> {
  try {
    return await createSupplier(input);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, error: "Nepřihlášeno." };
    }
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "Nemáte oprávnění založit dodavatele." };
    }
    throw error;
  }
}

// --- AI vytěžení účtenky (mobilní tok 1.0, body 1+10 zadání) --------------

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

// "Načíst údaje z dokladu" — veškerá logika (oprávnění, čtení stránek,
// volání modelu, mapování, idempotentní zápis) žije v
// triggerGoodsReceiptExtraction (lib/data/skladExtraction.ts).
export async function triggerGoodsReceiptExtractionAction(receiptId: string): Promise<SimpleActionResult> {
  try {
    return await triggerGoodsReceiptExtraction(receiptId);
  } catch (error) {
    return translateAuthError(error, "Nemáte oprávnění vytěžit doklad této příjemky.");
  }
}

export async function updateGoodsReceiptLineAction(
  receiptId: string,
  lineId: string,
  input: ManualLineInput
): Promise<SimpleActionResult> {
  try {
    return await updateGoodsReceiptLine(receiptId, lineId, input);
  } catch (error) {
    return translateAuthError(error, "Nemáte oprávnění upravit řádky této příjemky.");
  }
}

export async function reviewGoodsReceiptLineVatAction(
  receiptId: string,
  lineId: string,
  input: { totalWithoutVatHal: string; totalWithVatHal: string }
): Promise<SimpleActionResult> {
  try {
    return await reviewGoodsReceiptLineVat(receiptId, lineId, input);
  } catch (error) {
    return translateAuthError(error, "Nemáte oprávnění potvrdit DPH u téhle příjemky.");
  }
}

export async function confirmGoodsReceiptLineMappingAction(
  receiptId: string,
  lineId: string,
  input: { stockItemId: string | null; lineKind: string; rememberMapping: boolean }
): Promise<SimpleActionResult> {
  try {
    return await confirmGoodsReceiptLineMapping(receiptId, lineId, input);
  } catch (error) {
    return translateAuthError(error, "Nemáte oprávnění potvrdit mapování u téhle příjemky.");
  }
}

export type CreateStockItemActionResult = { ok: true; stockItemId: string } | { ok: false; error: string };

// Založení nové skladové karty přímo z kontrolní obrazovky (bod 7 zadání —
// "u nové položky pouze navrhni skladovou kartu... člověk musí první
// přiřazení potvrdit"), stejný vzor jako createSupplierForReceiptAction.
export async function createStockItemForReceiptAction(input: {
  name: string;
  canonicalUnit: string;
  kind: string;
}): Promise<CreateStockItemActionResult> {
  try {
    return await createStockItem(input);
  } catch (error) {
    return translateAuthError(error, "Nemáte oprávnění založit skladovou kartu.");
  }
}

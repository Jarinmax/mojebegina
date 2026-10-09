"use server";

// Sklad 1.0 (mobilní tok) — "use server" hranice pro založení draft
// příjemky, stejný princip jako app/rizeni-firmy/obchod/actions.ts: logika
// žije v lib/data/sklad.ts, tahle akce jen validuje formulář a přesměruje.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createDraftGoodsReceipt, createSupplier } from "@/lib/data/sklad";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

export type ActionState = { error: string } | null;

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

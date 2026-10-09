"use server";

// Sklad 1.0 (mobilní tok) — "use server" hranice pro založení draft
// příjemky, stejný princip jako app/rizeni-firmy/obchod/actions.ts: logika
// žije v lib/data/sklad.ts, tahle akce jen validuje formulář a přesměruje.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createDraftGoodsReceipt } from "@/lib/data/sklad";

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

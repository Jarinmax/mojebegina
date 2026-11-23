"use server";

// Akce nad vlastními fakturami MojeBegina (stránka Faktury). Každá akce
// projde stejným náhledem jako asistent (prepare → apply se stejným otiskem).
import { revalidatePath } from "next/cache";
import { applyOwnInvoiceChange, previewOwnInvoiceChange } from "@/lib/data/ownInvoiceChanges";
import type { OwnChangeInput } from "@/lib/eshop/invoicing/ownChange";

export type InvoiceActionState = { ok: boolean; message: string } | null;

async function run(input: OwnChangeInput): Promise<InvoiceActionState> {
  const preview = await previewOwnInvoiceChange(input);
  if (!preview.ok) return { ok: false, message: preview.error };
  if (preview.preview.blocking.length) return { ok: false, message: preview.preview.blocking.join(" ") };
  const result = await applyOwnInvoiceChange(input, { expectedFingerprint: preview.preview.fingerprint, via: "" });
  revalidatePath("/rizeni-firmy/faktury");
  if (!result.ok) return { ok: false, message: result.error };
  const verb = result.action === "edit" ? "upravená" : result.action === "cancel" ? "stornovaná" : "smazaná";
  return { ok: true, message: `Faktura ${result.number} je ${verb}.` };
}

export async function invoiceAction(_prev: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  const number = String(formData.get("number") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (kind === "paid") return run({ number, action: "edit", paidDate: String(formData.get("paidDate") ?? "") });
  if (kind === "unpaid") return run({ number, action: "edit", paidDate: false });
  if (kind === "cancel") return run({ number, action: "cancel", reason: String(formData.get("reason") ?? "") });
  if (kind === "delete") return run({ number, action: "delete" });
  return { ok: false, message: "Neznámá akce." };
}

"use client";

// Číslo, datum a celková částka dokladu — vytěžení je vyplní jen tam, kde
// byla prázdná; člověk je tu ověří nebo opraví. Celková částka slouží
// k porovnání se součtem řádků při potvrzení.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateGoodsReceiptHeaderAction } from "../../../actions";

export default function HlavickaForm({
  receiptId,
  documentNumber,
  documentDate,
  documentTotalWithVatHal,
}: {
  receiptId: string;
  documentNumber: string | null;
  documentDate: string | null;
  documentTotalWithVatHal: number | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await updateGoodsReceiptHeaderAction(receiptId, {
      documentNumber: String(formData.get("documentNumber") ?? ""),
      documentDate: String(formData.get("documentDate") ?? ""),
      documentTotalWithVat: String(formData.get("documentTotalWithVat") ?? ""),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
      <h2 className="text-sm font-medium text-begina-primary-900">Údaje z dokladu</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-xs text-neutral-500">
          Číslo dokladu
          <input name="documentNumber" defaultValue={documentNumber ?? ""} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          Datum dokladu
          <input type="date" name="documentDate" defaultValue={documentDate ?? ""} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          Celkem s DPH podle dokladu (Kč)
          <input
            name="documentTotalWithVat"
            inputMode="decimal"
            defaultValue={documentTotalWithVatHal === null ? "" : (documentTotalWithVatHal / 100).toFixed(2)}
            className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm"
          />
        </label>
      </div>
      <button type="submit" disabled={pending} className="self-start text-sm font-medium text-begina-primary-900 border border-begina-primary-900 rounded-lg px-3 py-1.5 disabled:opacity-50">
        {pending ? "Ukládám…" : "Uložit údaje dokladu"}
      </button>
      {saved && <p className="text-xs text-green-700">Uloženo.</p>}
      {error && <p className="text-sm text-red-800">{error}</p>}
    </form>
  );
}

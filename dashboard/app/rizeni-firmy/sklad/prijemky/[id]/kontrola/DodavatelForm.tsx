"use client";

// Ruční doplnění/oprava dodavatele na kontrolní obrazovce — appka ho jinak
// dohledá nebo založí sama podle vytěžení fotky (resolveSupplierId,
// skladExtraction.ts); tohle je cesta pro případ, kdy to nešlo (žádné IČO
// ani název na dokladu) nebo appka dohledala/založila špatně.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateGoodsReceiptSupplierAction } from "../../../actions";
import SupplierPicker from "../../../SupplierPicker";
import type { SupplierSummary } from "@/lib/data/sklad";

export default function DodavatelForm({
  receiptId,
  suppliers,
  currentSupplierId,
  currentSupplierName,
}: {
  receiptId: string;
  suppliers: SupplierSummary[];
  currentSupplierId: string | null;
  currentSupplierName: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(currentSupplierId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await updateGoodsReceiptSupplierAction(receiptId, selectedId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
      <h2 className="text-sm font-medium text-begina-primary-900">Dodavatel</h2>
      <p className="text-xs text-neutral-500">
        {currentSupplierId ? <>Appka dohledala: <strong>{currentSupplierName}</strong>.</> : "Appka dodavatele z fotky nerozpoznala."} Vyberte
        ho ručně, nebo opravte.
      </p>
      <SupplierPicker
        name="supplierId"
        suppliers={suppliers}
        selectedId={selectedId}
        onSelect={setSelectedId}
        unknownLabel="Vyberte dodavatele…"
      />
      <button
        type="button"
        disabled={pending || selectedId === currentSupplierId}
        onClick={handleSave}
        className="self-start text-sm font-medium text-begina-primary-900 border border-begina-primary-900 rounded-lg px-3 py-1.5 mt-2 disabled:opacity-50"
      >
        {pending ? "Ukládám…" : "Uložit dodavatele"}
      </button>
      {saved && <p className="text-xs text-green-700">Uloženo.</p>}
      {error && <p className="text-sm text-red-800">{error}</p>}
    </div>
  );
}

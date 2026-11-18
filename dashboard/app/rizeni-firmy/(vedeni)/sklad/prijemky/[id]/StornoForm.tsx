"use client";

// Storno potvrzené příjemky (blokující bod 3): opačné pohyby, nic se
// nemaže; důvod je povinný. Druhé storno server odmítne.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { voidGoodsReceiptAction } from "../../actions";

export default function StornoForm({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVoid() {
    if (!window.confirm("Opravdu stornovat příjemku? Ze skladu se odečte všechno, co tato příjemka naskladnila.")) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await voidGoodsReceiptAction(receiptId, reason);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm text-red-800 underline">
        Stornovat příjemku…
      </button>
    );
  }

  return (
    <div className="bg-white border border-red-200 rounded-xl p-4 flex flex-col gap-2">
      <label className="text-xs text-neutral-500">
        Důvod storna (povinný)
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={2}
          className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !reason.trim()}
          onClick={handleVoid}
          className="text-sm font-medium text-white bg-red-700 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Stornuji…" : "Stornovat"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 underline">
          Zrušit
        </button>
      </div>
      {error && <p className="text-sm text-red-800">{error}</p>}
    </div>
  );
}

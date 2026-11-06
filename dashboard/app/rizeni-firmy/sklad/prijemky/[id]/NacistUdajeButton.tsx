"use client";

// Mobilní tok 1.0 — "Načíst údaje z dokladu" (bod 1 zadání). Volá
// triggerGoodsReceiptExtractionAction přímo (ne přes <form action>), aby
// šlo po úspěchu hned obnovit server data (router.refresh()) a zobrazit
// odkaz na kontrolní obrazovku beze ztráty místa na stránce.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { triggerGoodsReceiptExtractionAction } from "../../actions";
import { PHOTO_QUALITY_TIP } from "./FotoCapture";
import type { TriggerExtractionFailureKind } from "@/lib/data/skladExtraction";

export default function NacistUdajeButton({ receiptId, disabled }: { receiptId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<TriggerExtractionFailureKind | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    setErrorKind(null);
    const result = await triggerGoodsReceiptExtractionAction(receiptId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setErrorKind(result.kind);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={handleClick}
        className="w-full text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {pending ? "Načítám údaje z dokladu…" : "Načíst údaje z dokladu"}
      </button>
      {disabled && !pending && (
        <p className="text-xs text-neutral-400 mt-1">Nejdřív vyfoťte aspoň jednu stranu dokladu.</p>
      )}
      {error && <p className="text-sm text-begina-accent-700 mt-1">{error}</p>}
      {/* "unreadable" = appka nezjistila použitelná data, ale NEtvrdí, že
          je prokázaně špatná fotka (bod 4 zadání) — jen připomene radu a
          odkáže na "Nahradit fotku" u strany výš. "technical" chyby tenhle
          dodatek nedostanou, s fotkou nemají co dělat. */}
      {errorKind === "unreadable" && (
        <p className="text-xs text-neutral-500 mt-1">{PHOTO_QUALITY_TIP} Fotku strany můžete nahradit výše.</p>
      )}
    </div>
  );
}

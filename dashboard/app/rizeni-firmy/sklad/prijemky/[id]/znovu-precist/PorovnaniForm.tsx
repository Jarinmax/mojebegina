"use client";

// Porovnání původních řádků s novým (zatím nepřevzatým) výsledkem
// "Znovu přečíst doklad". Nic se nezapíše, dokud uživatel výslovně
// neklikne na "Převzít nový výsledek" — appka to navíc jednou potvrdí
// (nahrazuje VŠECHNY původní řádky). "Zahodit" vrátí příjemku do stavu
// před kliknutím na "Znovu přečíst doklad", beze stopy na řádcích.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptGoodsReceiptReextractionAction, discardGoodsReceiptReextractionAction } from "../../../actions";
import type { GoodsReceiptLineRow } from "@/lib/data/sklad";
import type { ReextractionRawPayload } from "@/lib/data/skladExtraction";

function halToKc(hal: number): string {
  return (hal / 100).toFixed(2);
}

function OriginalLineCard({ line }: { line: GoodsReceiptLineRow }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3">
      <p className="text-sm font-medium text-begina-primary-900">{line.rawDescription}</p>
      <p className="text-xs text-neutral-500 mt-0.5">
        {line.normalizedQuantity} {line.normalizedUnit} · {halToKc(line.totalWithVatHal)} Kč s DPH
      </p>
    </div>
  );
}

function NewLineCard({ line }: { line: ReextractionRawPayload["lines"][number] }) {
  return (
    <div className="bg-white border border-begina-primary-200 rounded-xl p-3">
      <p className="text-sm font-medium text-begina-primary-900">{line.rawDescription}</p>
      <p className="text-xs text-neutral-500 mt-0.5">
        {line.normalizedQuantity} {line.normalizedUnit} · {halToKc(line.totalWithVatHal)} Kč s DPH
      </p>
    </div>
  );
}

export default function PorovnaniForm({
  receiptId,
  originalLines,
  raw,
}: {
  receiptId: string;
  originalLines: GoodsReceiptLineRow[];
  raw: ReextractionRawPayload;
}) {
  const router = useRouter();
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending(true);
    setError(null);
    const result = await acceptGoodsReceiptReextractionAction(receiptId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/rizeni-firmy/sklad/prijemky/${receiptId}/kontrola`);
  }

  async function handleDiscard() {
    setPending(true);
    setError(null);
    const result = await discardGoodsReceiptReextractionAction(receiptId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/rizeni-firmy/sklad/prijemky/${receiptId}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-medium text-neutral-500 mb-2">Původní řádky ({originalLines.length})</h2>
        <div className="flex flex-col gap-2">
          {originalLines.map((line) => (
            <OriginalLineCard key={line.id} line={line} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-500 mb-2">
          Nový výsledek ({raw.lines.length})
          {raw.droppedLineCount > 0 && <span className="text-neutral-400"> — {raw.droppedLineCount} nečitelných řádků přeskočeno</span>}
        </h2>
        <div className="flex flex-col gap-2">
          {raw.lines.map((line) => (
            <NewLineCard key={line.position} line={line} />
          ))}
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
        {!confirmingAccept ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmingAccept(true)}
              className="w-full text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
            >
              Převzít nový výsledek
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleDiscard}
              className="w-full text-sm font-medium text-neutral-500 border border-neutral-300 rounded-lg px-4 py-2.5 disabled:opacity-50"
            >
              {pending ? "Zahazuji…" : "Zahodit nový výsledek, zachovat původní řádky"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-700">
              Opravdu nahradit VŠECH {originalLines.length} původních řádků {raw.lines.length} novými? Řádky bude po
              nahrazení potřeba znovu zkontrolovat (DPH, mapování na skladovou kartu).
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={handleAccept}
                className="flex-1 text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
              >
                {pending ? "Nahrazuji…" : "Ano, nahradit"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmingAccept(false)}
                className="text-sm font-medium text-neutral-500 border border-neutral-300 rounded-lg px-4 py-2.5 disabled:opacity-50"
              >
                Zrušit
              </button>
            </div>
          </>
        )}
        {error && <p className="text-sm text-begina-accent-700">{error}</p>}
      </div>
    </div>
  );
}

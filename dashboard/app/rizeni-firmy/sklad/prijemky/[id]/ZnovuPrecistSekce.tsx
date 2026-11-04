"use client";

// "Znovu přečíst doklad" — opakované AI vytěžení draft příjemky, co už
// může mít řádky. Spouští se výhradně ručně a až po výslovném potvrzení
// upozornění na nové (placené) AI volání — na rozdíl od prvního čtení
// (NacistUdajeButton) je tu riziko vyššího dopadu (existují už řádky ke
// ztrátě při neuváženém kliknutí), proto dvoukrokové potvrzení navíc.
// Výsledek se NIKDY nepromítne do řádků odtud — appka jen nabídne odkaz
// na porovnávací obrazovku (znovu-precist/), kde je explicitní převzetí
// nebo zahození.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { triggerGoodsReceiptReextractionAction } from "../../actions";
import type { TriggerExtractionFailureKind } from "@/lib/data/skladExtraction";

export default function ZnovuPrecistSekce({ receiptId, reextractionStatus }: { receiptId: string; reextractionStatus: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<TriggerExtractionFailureKind | null>(null);

  async function handleConfirmedStart() {
    setPending(true);
    setError(null);
    setErrorKind(null);
    const result = await triggerGoodsReceiptReextractionAction(receiptId);
    setPending(false);
    setConfirming(false);
    if (!result.ok) {
      setError(result.error);
      setErrorKind(result.kind);
      return;
    }
    router.refresh();
  }

  if (reextractionStatus === "ready") {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <p className="text-sm text-begina-primary-900 mb-2">
          Nové čtení doklad znovu vytěžilo. Výsledek čeká na porovnání s původními řádky.
        </p>
        <Link
          href={`/rizeni-firmy/sklad/prijemky/${receiptId}/znovu-precist`}
          className="block w-full text-center text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5"
        >
          Porovnat nový výsledek
        </Link>
      </div>
    );
  }

  if (reextractionStatus === "pending") {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <p className="text-sm text-neutral-500">Nové čtení dokladu probíhá…</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      {reextractionStatus === "failed" && !confirming && (
        <p className="text-sm text-begina-accent-700 mb-2">Předchozí pokus o nové čtení se nezdařil. Původní řádky zůstaly beze změny.</p>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full text-sm font-medium text-begina-primary-900 border border-begina-primary-900 rounded-lg px-4 py-2.5"
        >
          Znovu přečíst doklad
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-700">
            Spustí se nové (placené) AI čtení nad už nahranými fotkami dokladu. Původní řádky zůstanou beze změny — nový
            výsledek se teprve zobrazí k porovnání a nahradí je jen po vašem výslovném potvrzení.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleConfirmedStart}
              className="flex-1 text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-50"
            >
              {pending ? "Spouštím nové čtení…" : "Potvrdit a spustit nové čtení"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="text-sm font-medium text-neutral-500 border border-neutral-300 rounded-lg px-4 py-2.5 disabled:opacity-50"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-begina-accent-700 mt-2">{error}</p>}
      {errorKind === "unreadable" && <p className="text-xs text-neutral-500 mt-1">Zkuste to znovu, nebo nahrajte lepší fotografii výše.</p>}
    </div>
  );
}

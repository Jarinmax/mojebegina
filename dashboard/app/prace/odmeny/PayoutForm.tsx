"use client";

import { useActionState } from "react";
import { addJardaPayoutAction, type PayoutActionState } from "./actions";

export default function PayoutForm() {
  const [state, formAction, pending] = useActionState<PayoutActionState, FormData>(addJardaPayoutAction, null);
  return (
    <details className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-begina-primary-900">Zapsat zaplacenou fakturu od Jardy</summary>
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      <p className="text-xs text-neutral-600">
        Jen záznam v MojeBegina — žádné peníze se tím neposílají. Postup: Jarda dostane měsíční vyúčtování, podle něj vystaví
        fakturu, my ji zaplatíme z banky a teprve pak ji tady zapíšeš. Pak se mu sníží „Zbývá vyplatit“.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500">
          Částka (Kč)
          <input name="amountKc" type="number" min={1} step={1} required className="mt-1 w-full min-h-11 rounded-lg border border-neutral-300 px-3 text-base" />
        </label>
        <label className="text-xs text-neutral-500">
          Datum zaplacení
          <input name="paidOn" type="date" className="mt-1 w-full min-h-11 rounded-lg border border-neutral-300 px-3 text-base" />
        </label>
      </div>
      <label className="text-xs text-neutral-500">
        Číslo jeho faktury / poznámka
        <input name="note" type="text" maxLength={500} placeholder="Např. faktura 2026001 – provize za listopad" className="mt-1 w-full min-h-11 rounded-lg border border-neutral-300 px-3 text-base" />
      </label>
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-begina-primary-50 disabled:opacity-50">
        {pending ? "Ukládám…" : "Zapsat zaplacenou fakturu"}
      </button>
    </form>
    </details>
  );
}

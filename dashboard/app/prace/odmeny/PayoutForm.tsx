"use client";

import { useActionState } from "react";
import { addJardaPayoutAction, type PayoutActionState } from "./actions";

export default function PayoutForm() {
  const [state, formAction, pending] = useActionState<PayoutActionState, FormData>(addJardaPayoutAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <h3 className="text-sm font-medium text-begina-primary-900">Zapsat výplatu odměny</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500">
          Částka (Kč)
          <input name="amountKc" type="number" min={1} step={1} required className="mt-1 w-full min-h-11 rounded-lg border border-neutral-300 px-3 text-base" />
        </label>
        <label className="text-xs text-neutral-500">
          Datum výplaty
          <input name="paidOn" type="date" className="mt-1 w-full min-h-11 rounded-lg border border-neutral-300 px-3 text-base" />
        </label>
      </div>
      <label className="text-xs text-neutral-500">
        Poznámka (nepovinné)
        <input name="note" type="text" maxLength={500} placeholder="Např. provize za říjen" className="mt-1 w-full min-h-11 rounded-lg border border-neutral-300 px-3 text-base" />
      </label>
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-begina-primary-50 disabled:opacity-50">
        {pending ? "Ukládám…" : "Zapsat výplatu"}
      </button>
    </form>
  );
}

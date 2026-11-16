"use client";

import { useActionState } from "react";
import { updateIngredientPriceAction, type PriceActionState } from "../actions";

export default function PriceRow({ id, name, unitLabel, price, note, usedIn }: { id: string; name: string; unitLabel: string; price: string; note: string; usedIn: number | null }) {
  const [state, action, pending] = useActionState<PriceActionState, FormData>(updateIngredientPriceAction, null);
  return (
    <form action={action} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_9rem_minmax(0,1.6fr)_auto] gap-2 items-center px-3 py-2 border-b border-neutral-100 last:border-0">
      <input type="hidden" name="id" value={id} />
      <div className="text-sm">
        <span className="font-medium text-neutral-900">{name}</span>
        {usedIn !== null && <span className="ml-2 text-xs text-neutral-500">{usedIn === 0 ? "v žádné receptuře" : `v ${usedIn} recepturách`}</span>}
      </div>
      <label className="flex items-center gap-1 text-sm text-neutral-600">
        <input name="price" defaultValue={price} inputMode="decimal" aria-label={`Cena – ${name}`} className="w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right text-neutral-900" />
        <span className="whitespace-nowrap text-xs">{unitLabel}</span>
      </label>
      <input name="note" defaultValue={note} placeholder="poznámka (kde nakupujeme)" aria-label={`Poznámka – ${name}`} className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900" />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-begina-primary-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {pending ? "Ukládám…" : "Uložit"}
        </button>
        {state && "error" in state && <span className="text-xs text-red-700">{state.error}</span>}
        {state && "success" in state && <span className="text-xs text-green-700">Uloženo</span>}
      </div>
    </form>
  );
}

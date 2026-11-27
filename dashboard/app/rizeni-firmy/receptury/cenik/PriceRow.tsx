"use client";

import { useActionState } from "react";
import { updateIngredientPriceAction, type PriceActionState } from "../actions";

// Cena suroviny / obalu v ceníku (ruční přepis). Poznámky nahradily nabídky s odkazy.
export default function PriceRow({ id, name, unitLabel, price, usedIn }: { id: string; name: string; unitLabel: string; price: string; usedIn: number | null }) {
  const [state, action, pending] = useActionState<PriceActionState, FormData>(updateIngredientPriceAction, null);
  return (
    <form action={action} className="flex flex-wrap gap-2 items-center">
      <input type="hidden" name="id" value={id} />
      <div className="text-sm flex-1 min-w-[12rem]">
        <span className="font-medium text-neutral-900">{name}</span>
        {usedIn !== null && <span className="ml-2 text-xs text-neutral-500">{usedIn === 0 ? "v žádném receptu" : `v ${usedIn} ${usedIn === 1 ? "receptu" : "receptech"}`}</span>}
      </div>
      <label className="flex items-center gap-1 text-sm text-neutral-600">
        <input name="price" defaultValue={price} inputMode="decimal" aria-label={`Cena – ${name}`} className="w-24 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right text-neutral-900" />
        <span className="whitespace-nowrap text-xs">{unitLabel}</span>
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-begina-primary-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
        {pending ? "Ukládám…" : "Uložit"}
      </button>
      {state && "error" in state && <span className="text-xs text-red-700">{state.error}</span>}
      {state && "success" in state && <span className="text-xs text-green-700">Uloženo</span>}
    </form>
  );
}

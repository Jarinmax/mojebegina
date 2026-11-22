"use client";

import { useActionState } from "react";
import { saveFuelSurchargeAction, type FuelActionState } from "./actions";

export default function FuelSurchargeForm({ percent }: { percent: number }) {
  const [state, action, pending] = useActionState<FuelActionState, FormData>(saveFuelSurchargeAction, null);
  return (
    <form action={action} className="rounded-xl border-2 border-[#5E6B34] bg-[#FAF6EF] p-4 flex flex-col gap-3">
      <h2 className="font-semibold text-lg">Palivový příplatek CoolBalík</h2>
      <p className="text-sm text-neutral-700">
        Mění se každý měsíc. Po uložení se přepočítají ceny dopravy na e-shopu: košík, pokladna, stránka Doprava i tabulka ceny porce.
      </p>
      <label className="flex items-center gap-2 text-base">
        <input
          name="percent"
          defaultValue={percent.toLocaleString("cs-CZ")}
          inputMode="decimal"
          className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-right tabular-nums"
          aria-label="Palivový příplatek v procentech"
        />
        <span>%</span>
        <button type="submit" disabled={pending} className="ml-2 rounded-lg bg-neutral-900 text-white px-4 py-2 font-medium disabled:opacity-60">
          {pending ? "Ukládám…" : "Uložit"}
        </button>
      </label>
      {state && "error" in state && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state && "success" in state && <p role="status" className="text-sm text-green-800">{state.success}</p>}
    </form>
  );
}

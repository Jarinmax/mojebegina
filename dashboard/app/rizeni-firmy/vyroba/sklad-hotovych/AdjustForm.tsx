"use client";

import { useActionState } from "react";
import { adjustStockAction, type AdjustState } from "./actions";

export default function AdjustForm({ sku }: { sku: string }) {
  const [state, action, pending] = useActionState<AdjustState, FormData>(adjustStockAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 mt-2">
      <input type="hidden" name="sku" value={sku} />
      <select name="mode" defaultValue="minus" className="px-2 py-1.5 border border-neutral-200 rounded-lg text-sm">
        <option value="minus">Odepsat</option>
        <option value="plus">Přidat</option>
        <option value="set">Nastavit na</option>
      </select>
      <input name="amount" type="number" min={0} defaultValue={1} className="w-16 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm" />
      <span className="text-sm text-neutral-600">ks</span>
      <input name="reason" type="text" required placeholder="Důvod (vzorek, bistro, inventura…)" className="flex-1 min-w-48 px-2 py-1.5 border border-neutral-200 rounded-lg text-sm" />
      <button disabled={pending} className="rounded-full bg-begina-primary-900 text-white text-sm px-4 py-1.5 disabled:opacity-50">
        {pending ? "Ukládám…" : "Uložit"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-green-700">{state.success}</p>}
    </form>
  );
}

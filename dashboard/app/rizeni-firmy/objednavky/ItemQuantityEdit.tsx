"use client";

import { useActionState, useState } from "react";
import { setOrderItemQuantityAction, type ActionState } from "./actions";

// Počet kusů položky ruční objednávky — „upravit“ u položky (Jarin 27. 11. 2026).
export default function ItemQuantityEdit({ orderId, itemId, quantity, name }: { orderId: string; itemId: string; quantity: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(setOrderItemQuantityAction.bind(null, orderId, itemId), null);
  if (!open) {
    return (
      <span>
        <button type="button" onClick={() => setOpen(true)} className="ml-2 text-xs underline text-neutral-500">
          upravit počet
        </button>
        {state && "success" in state && <span className="block text-xs text-emerald-700">{state.success}</span>}
      </span>
    );
  }
  return (
    <form
      action={async (fd) => {
        await action(fd);
        setOpen(false);
      }}
      className="mt-1 flex flex-wrap items-center gap-2"
    >
      <input
        type="number"
        name="quantity"
        min={0}
        max={999}
        defaultValue={quantity}
        aria-label={`Počet kusů – ${name}`}
        className="w-20 px-2 py-1 border border-neutral-300 rounded-lg text-sm text-begina-primary-900 bg-white"
      />
      <span className="text-xs text-neutral-500">ks (0 = odebrat)</span>
      <button type="submit" disabled={pending} className="text-xs font-medium text-white bg-begina-primary-900 rounded-lg px-3 py-1.5 disabled:opacity-50">
        {pending ? "Ukládám…" : "Uložit"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 text-neutral-700">
        Zrušit
      </button>
      {state && "error" in state && <span className="block w-full text-xs text-red-700">{state.error}</span>}
    </form>
  );
}

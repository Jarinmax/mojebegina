"use client";

import { useActionState } from "react";
import { toggleCellProducedAction, type ProducedState } from "./actions";

// Kliknutelné políčko souhrnné výrobní tabulky (19. 11. 2026, Jarin):
// klik = vyrobeno (zelené ✓), další klik = vrátit zpět.
export default function ProducedCell({ orderId, itemIds, qty, done }: { orderId: string; itemIds: string[]; qty: number; done: boolean }) {
  const [state, formAction, pending] = useActionState<ProducedState>(toggleCellProducedAction.bind(null, orderId, itemIds, !done), null);
  return (
    <form action={formAction} className="h-full">
      <button
        type="submit"
        disabled={pending}
        aria-pressed={done}
        title={done ? "Vyrobeno — kliknutím vrátíte zpět" : "Kliknutím označíte jako vyrobené"}
        className={`w-full min-h-[3rem] rounded-lg border-2 px-2 py-1.5 font-bold text-[16px] cursor-pointer disabled:opacity-60 ${
          done ? "bg-emerald-500 border-emerald-600 text-white" : "bg-white/60 border-dashed border-neutral-400 text-neutral-900 hover:border-neutral-900"
        }`}
      >
        {pending ? "…" : done ? `✓ ${qty}` : qty}
      </button>
      {state?.error && <span className="block text-xs text-red-700">{state.error}</span>}
    </form>
  );
}

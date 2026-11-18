"use client";

import { useActionState } from "react";
import { toggleProducedAction, type ProducedState } from "./actions";

// Velké zaškrtávátko „vyrobeno“ u položky na výrobní kartě. Klepnutí na
// zaškrtnuté = vrátit zpět (kdyby se Jarin ukliknul).
export default function ProducedCheck({
  orderId,
  itemId,
  produced,
  quantity,
  name,
  rowClass,
  producedNote,
}: {
  orderId: string;
  itemId: string;
  produced: boolean;
  quantity: number;
  name: string;
  rowClass: string;
  producedNote: string | null;
}) {
  const [state, formAction, pending] = useActionState<ProducedState>(
    toggleProducedAction.bind(null, orderId, itemId, !produced),
    null
  );
  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        aria-pressed={produced}
        className={`w-full flex items-center gap-3 text-left rounded-xl border-2 p-3 mt-1.5 disabled:opacity-60 ${rowClass} ${
          produced ? "border-emerald-600" : "border-transparent"
        }`}
      >
        <span className="text-2xl font-extrabold min-w-[3rem] text-center text-begina-primary-900">{quantity}×</span>
        <span className="flex-1 min-w-0">
          <span className={`block text-[15px] break-words ${produced ? "line-through text-neutral-500" : "text-begina-primary-900"}`}>
            {name}
          </span>
          {produced && producedNote && <span className="block text-xs text-neutral-500">{producedNote}</span>}
          {pending && <span className="block text-xs text-neutral-500">Ukládám…</span>}
          {state?.error && <span className="block text-xs text-red-700">{state.error}</span>}
        </span>
        <span
          aria-hidden
          className={`flex-none w-10 h-10 rounded-[10px] border-2 flex items-center justify-center text-2xl leading-none ${
            produced ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-neutral-400"
          }`}
        >
          {produced ? "✓" : ""}
        </span>
      </button>
    </form>
  );
}

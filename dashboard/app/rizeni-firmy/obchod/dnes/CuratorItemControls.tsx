"use client";

import { useActionState } from "react";
import { removeQueueItemAction, moveQueueItemUpAction, moveQueueItemDownAction, type ActionState } from "./actions";

const initialState: ActionState = null;

// Security Phase 19 — regrese na bug nahlášený na Preview: "Odebrat"
// nedávalo po kliknutí žádnou viditelnou odezvu, takže dvojklik odebral
// dvě položky místo jedné. Každé tlačítko má vlastní useActionState (aby
// šlo zobrazit JEHO vlastní probíhající stav — "Přesouvám…"/"Odebírám…"),
// ale dokud běží JAKÁKOLI ze tří akcí na téhle položce, jsou deaktivovaná
// VŠECHNA tři tlačítka (ne jen to aktuálně klikané) — jinak by šlo např.
// odebrat položku uprostřed probíhajícího přeřazení.
export default function CuratorItemControls({
  itemId,
  isFirst,
  isLast,
}: {
  itemId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [upState, upAction, upPending] = useActionState(moveQueueItemUpAction.bind(null, itemId), initialState);
  const [downState, downAction, downPending] = useActionState(
    moveQueueItemDownAction.bind(null, itemId),
    initialState
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeQueueItemAction.bind(null, itemId),
    initialState
  );

  const anyPending = upPending || downPending || removePending;
  const error =
    (upState && "error" in upState && upState.error) ||
    (downState && "error" in downState && downState.error) ||
    (removeState && "error" in removeState && removeState.error) ||
    null;

  return (
    <div className="flex flex-col gap-1 pt-1 border-t border-neutral-100">
      <div className="flex items-center gap-2">
        <form action={upAction}>
          <button
            type="submit"
            disabled={isFirst || anyPending}
            className="text-xs font-medium text-neutral-600 border border-neutral-200 rounded-lg px-2 py-1 disabled:opacity-30"
          >
            {upPending ? "Přesouvám…" : "↑ Výš"}
          </button>
        </form>
        <form action={downAction}>
          <button
            type="submit"
            disabled={isLast || anyPending}
            className="text-xs font-medium text-neutral-600 border border-neutral-200 rounded-lg px-2 py-1 disabled:opacity-30"
          >
            {downPending ? "Přesouvám…" : "↓ Níž"}
          </button>
        </form>
        <form action={removeAction} className="ml-auto">
          <button
            type="submit"
            disabled={anyPending}
            className="text-xs font-medium text-begina-accent-700 px-2 py-1 disabled:opacity-30"
          >
            {removePending ? "Odebírám…" : "Odebrat"}
          </button>
        </form>
      </div>
      {error && <p className="text-xs text-begina-accent-700">{error}</p>}
    </div>
  );
}

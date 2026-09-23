"use client";

import { useActionState, useRef, useState } from "react";
import { updateNodePriorityAction, type ActionState } from "../../node-actions";

// Security Phase 12 (Řízení firmy 2.0) — priorita ovlivňuje propagaci
// stavu (viz statusPropagation.ts: jen red + high/critical zbarví rodiče
// červeně) — proto vlastní jednoduchý formulář, ukládá se rovnou při
// výběru (bez samostatného tlačítka).
const initialState: ActionState = null;

type Priority = "low" | "medium" | "high" | "critical";

type Props = {
  nodeId: string;
  parentId: string | null;
  currentPriority: Priority;
};

export default function PriorityForm({ nodeId, parentId, currentPriority }: Props) {
  const boundUpdate = updateNodePriorityAction.bind(null, nodeId, parentId);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Ovládaná hodnota (ne defaultValue) — dřívější `defaultValue` byla
  // nespolehlivá: po `revalidatePath` (Next.js re-render s novými server
  // props) se select uměl vrátit na starou hodnotu z DB dřív, než uživatel
  // vůbec viděl výsledek uložení. `priority` tady vždy odráží to, co
  // uživatel vybral; se serverem se sesynchronizuje jen při skutečné změně
  // `currentPriority` (úspěšné uložení, nebo změna od někoho jiného) —
  // "adjusting state on prop change" během renderu, ne v efektu.
  const [priority, setPriority] = useState<Priority>(currentPriority);
  const [syncedPriority, setSyncedPriority] = useState<Priority>(currentPriority);
  if (currentPriority !== syncedPriority) {
    setSyncedPriority(currentPriority);
    setPriority(currentPriority);
  }

  return (
    <form action={formAction} ref={formRef} className="flex items-center gap-2">
      <label htmlFor="priority" className="text-xs text-neutral-500">
        Priorita
      </label>
      <select
        id="priority"
        name="priority"
        value={priority}
        disabled={pending}
        onChange={(e) => {
          setPriority(e.target.value as Priority);
          formRef.current?.requestSubmit();
        }}
        className="px-2 py-1.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white disabled:opacity-50"
      >
        <option value="low">Nízká</option>
        <option value="medium">Střední</option>
        <option value="high">Vysoká</option>
        <option value="critical">Kritická</option>
      </select>
      {state && "error" in state && (
        <p className="text-xs text-begina-accent-700">{state.error}</p>
      )}
    </form>
  );
}

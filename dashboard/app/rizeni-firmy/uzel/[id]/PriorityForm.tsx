"use client";

import { useActionState, useRef } from "react";
import { updateNodePriorityAction, type ActionState } from "../../node-actions";

// Security Phase 12 (Řízení firmy 2.0) — priorita ovlivňuje propagaci
// stavu (viz statusPropagation.ts: jen red + high/critical zbarví rodiče
// červeně) — proto vlastní jednoduchý formulář, ukládá se rovnou při
// výběru (bez samostatného tlačítka).
const initialState: ActionState = null;

type Props = {
  nodeId: string;
  parentId: string | null;
  currentPriority: "low" | "medium" | "high" | "critical";
};

export default function PriorityForm({ nodeId, parentId, currentPriority }: Props) {
  const boundUpdate = updateNodePriorityAction.bind(null, nodeId, parentId);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={formAction} ref={formRef} className="flex items-center gap-2">
      <label htmlFor="priority" className="text-xs text-neutral-500">
        Priorita
      </label>
      <select
        id="priority"
        name="priority"
        defaultValue={currentPriority}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
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

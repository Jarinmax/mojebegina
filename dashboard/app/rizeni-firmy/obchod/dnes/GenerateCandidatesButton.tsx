"use client";

import { useActionState } from "react";
import { generateDraftCandidatesAction, type ActionState } from "./actions";

const initialState: ActionState = null;

// Security Phase 19 — stejná oprava jako CuratorItemControls: tlačítko
// se po kliknutí musí okamžitě deaktivovat a ukázat probíhající stav,
// jinak dvojklik spustí návrh dvakrát souběžně.
export default function GenerateCandidatesButton() {
  const [state, formAction, pending] = useActionState(generateDraftCandidatesAction, initialState);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-900 border border-begina-primary-300 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Navrhuji…" : "Navrhnout dnešní kontakty"}
        </button>
      </form>
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
      {state && "success" in state && <p className="text-xs text-emerald-700">{state.success}</p>}
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { createFocusProjectAction, type ActionState } from "./actions";

// Security Phase 17 (CEO přehled 1.0) — stejný vzor jako CreateNodeForm.tsx
// v Řízení firmy. Jen název — priorita/stav/popis/další krok se doplní na
// detailu přes FocusUpdateForm, aby založení nového projektu šlo rychle
// ("možnost později přidávat další" z zadání, ne komplikovaný formulář).
const initialState: ActionState = null;

export default function CreateFocusProjectForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createFocusProjectAction, initialState);

  const [processedState, setProcessedState] = useState(state);
  if (state !== processedState) {
    setProcessedState(state);
    if (state && "success" in state) {
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2"
      >
        Přidat projekt
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3 mb-2"
    >
      <div>
        <label htmlFor="focus-title" className="text-xs text-neutral-500 mb-1 block">
          Název projektu
        </label>
        <input
          id="focus-title"
          name="title"
          type="text"
          required
          placeholder="Např. Begina.cz – nový web"
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Zakládám…" : "Uložit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-sm font-medium text-neutral-600 px-4 py-2"
        >
          Zavřít
        </button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { logDailyCallOutcomeAction, type ActionState } from "./actions";
import CallOutcomeFields from "../CallOutcomeFields";

const initialState: ActionState = null;

// Security Phase 19 (Denní volání 1.0) — zápis výsledku hovoru.
//
// Jarda – volání a provize, část 1, bod 2 doplňku ("Jednotný zápis
// výsledku hovoru") — samotná pole (výsledek/poznámka/fáze/termín/další
// krok) teď žijí ve sdílené CallOutcomeFields (../CallOutcomeFields.tsx),
// stejné pro tuhle obrazovku i pro CallLogForm (detail leadu) — dřív měly
// dvě nezávislé kopie, co se časem rozešly (CallLogForm vůbec neměl
// "Výsledek hovoru"). Expand/collapse, useActionState a submit tlačítko
// zůstávají tady — to je chrome kolem polí, ne pole samotná.
export default function CallOutcomeForm({ itemId }: { itemId: string }) {
  const boundAction = logDailyCallOutcomeAction.bind(null, itemId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState("");

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 self-start"
      >
        Zapsat výsledek
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 pt-2 border-t border-neutral-100">
      <CallOutcomeFields idPrefix={`-${itemId}`} result={result} onResultChange={setResult} />

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Ukládám…" : "Uložit výsledek"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-sm font-medium text-neutral-500 px-4 py-2"
        >
          Zrušit
        </button>
      </div>
    </form>
  );
}

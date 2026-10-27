"use client";

import { useActionState, useState } from "react";
import { cancelWorkTaskAction, type PraceActionState } from "../../actions";

// Práce 1.1 — zrušení ve dvou klepnutích: „Zrušit úkol“ → potvrzení
// „Ano, zrušit“. Žádné podržení prstu ani systémový dialog (na mobilu se
// snadno přehlédne). Úkol se nemaže, jen označí jako zrušený.
export default function CancelTaskPanel({ taskId }: { taskId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<PraceActionState, FormData>(cancelWorkTaskAction.bind(null, taskId), null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 w-full rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700"
      >
        Zrušit úkol
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-800 font-medium">Opravdu zrušit tento úkol? Zmizí zaměstnanci z aktivního seznamu, v historii zůstane.</p>
      <input
        name="reason"
        maxLength={500}
        placeholder="Důvod (nepovinné)"
        aria-label="Důvod zrušení"
        className="w-full px-3 py-2.5 border border-red-200 rounded-lg text-base bg-white"
      />
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Ruším…" : "Ano, zrušit"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="min-h-11 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700">
          Ne, ponechat
        </button>
      </div>
    </form>
  );
}

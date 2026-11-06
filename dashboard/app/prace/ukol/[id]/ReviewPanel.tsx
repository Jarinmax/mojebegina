"use client";

import { useActionState, useState } from "react";
import { reviewWorkTaskAction, type PraceActionState } from "../../actions";

// Práce 2.0 — kontrola vedoucím: „Schválit“ jedním klepnutím, „Vrátit
// k opravě“ vyžaduje důvod (povinný i na serveru).
export default function ReviewPanel({ taskId }: { taskId: string }) {
  const [returning, setReturning] = useState(false);
  const [approveState, approve, approving] = useActionState<PraceActionState, FormData>(reviewWorkTaskAction.bind(null, taskId, true), null);
  const [returnState, sendBack, sending] = useActionState<PraceActionState, FormData>(reviewWorkTaskAction.bind(null, taskId, false), null);
  const big = "min-h-12 w-full rounded-lg px-4 py-3 text-base font-medium disabled:opacity-50";
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-800">Úkol čeká na vaši kontrolu.</p>
      {!returning && (
        <form action={approve}>
          <button type="submit" disabled={approving} className={`${big} bg-emerald-600 text-white`}>
            {approving ? "Schvaluji…" : "Schválit"}
          </button>
        </form>
      )}
      {approveState && "error" in approveState && <p className="text-sm text-red-700">{approveState.error}</p>}
      {!returning ? (
        <button type="button" onClick={() => setReturning(true)} className={`${big} border border-red-300 bg-white text-red-700`}>
          Vrátit k opravě
        </button>
      ) : (
        <form action={sendBack} className="flex flex-col gap-2">
          <textarea
            name="reason"
            required
            rows={3}
            maxLength={1000}
            placeholder="Co je potřeba opravit (povinné)"
            aria-label="Důvod vrácení"
            className="w-full px-3 py-2.5 border border-red-200 rounded-lg text-base bg-white"
          />
          {returnState && "error" in returnState && <p className="text-sm text-red-700">{returnState.error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" disabled={sending} className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {sending ? "Vracím…" : "Vrátit k opravě"}
            </button>
            <button type="button" onClick={() => setReturning(false)} className="min-h-11 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700">
              Zpět
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

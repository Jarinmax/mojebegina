"use client";

import { useActionState, useState } from "react";
import { logDailyCallOutcomeAction, type ActionState } from "./actions";
import { CALL_RESULTS } from "@/lib/data/dailyCallsValidation";
import { CALL_RESULT_LABELS } from "./dailyCallLabels";
import { LEAD_STAGES } from "@/lib/data/leadValidation";
import { STAGE_LABELS } from "../leadLabels";
import type { CallResult } from "@/lib/data/dailyCallsValidation";
import type { LeadStage } from "@/lib/data/leadValidation";

const initialState: ActionState = null;

// Security Phase 19 (Denní volání 1.0) — zápis výsledku hovoru. Výsledek
// (CALL_RESULTS) i poznámka jsou povinné (žádná prázdná/"beze změny"
// možnost u výsledku — schváleno explicitně, výsledek hovoru NENÍ obchodní
// fáze). Posun fáze je samostatný, nepovinný select s výchozí "Fázi
// neměnit" — stejná konvence jako CallLogForm. Datum dalšího kontaktu je
// nepovinné, KROMĚ výsledku "Zavolat později" — vynucení je na serveru
// (validateDailyCallOutcomeInput), UI to jen napovídá.
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
      <div>
        <label htmlFor={`result-${itemId}`} className="text-xs text-neutral-500 mb-1 block">
          Výsledek hovoru
        </label>
        <select
          id={`result-${itemId}`}
          name="result"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="" disabled>
            Vyberte výsledek…
          </option>
          {CALL_RESULTS.map((r: CallResult) => (
            <option key={r} value={r}>
              {CALL_RESULT_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <textarea
        name="note"
        rows={2}
        placeholder="Co bylo domluveno…"
        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`stageChange-${itemId}`} className="text-xs text-neutral-500 mb-1 block">
            Posunout fázi na
          </label>
          <select
            id={`stageChange-${itemId}`}
            name="stageChange"
            defaultValue=""
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
          >
            <option value="">Fázi neměnit</option>
            {LEAD_STAGES.map((stage: LeadStage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`nextFollowUpAtDate-${itemId}`} className="text-xs text-neutral-500 mb-1 block">
            Další kontakt{result === "call_back_later" ? " (povinné)" : ""}
          </label>
          <div className="flex gap-2">
            <input
              id={`nextFollowUpAtDate-${itemId}`}
              name="nextFollowUpAtDate"
              type="date"
              required={result === "call_back_later"}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
            />
            <input
              id={`nextFollowUpAtTime-${itemId}`}
              name="nextFollowUpAtTime"
              type="time"
              required={result === "call_back_later"}
              aria-label="Čas dalšího kontaktu"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
            />
          </div>
        </div>
      </div>

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

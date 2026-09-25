"use client";

import { useActionState } from "react";
import { logCallOutcomeAction, type ActionState } from "../../actions";
import { LEAD_STAGES } from "@/lib/data/leadValidation";
import { STAGE_LABELS } from "../../leadLabels";
import { formatCzechDate } from "@/lib/format";
import type { LeadStage } from "@/lib/data/leadValidation";

const initialState: ActionState = null;

type Props = {
  leadId: string;
  nextFollowUpAt: Date | null;
  nextStepNote: string | null;
};

// Security Phase 16 (Obchod/CRM 1.0) — rychlý zápis po hovoru: jeden
// formulář, jeden submit. Všechna pole nepovinná (viz validateCallLogInput)
// — Jarda může zapsat jen poznámku, jen posun fáze, jen datum, nebo
// cokoliv dohromady, podle toho, co hovor přinesl.
//
// Security Phase 16.5 — React po úspěšném submitu formulář vyprázdní
// (vestavěné chování <form action>), takže po uložení není z prázdných
// polí vidět, že se plán skutečně uložil (nahlášeno na reálném testu).
// Proto se aktuální naplánovaný stav (nextFollowUpAt/nextStepNote z DB,
// ne z formuláře) zobrazuje samostatně nad formulářem — nezávisle na tom,
// jestli jsou pole zrovna vyplněná nebo prázdná.
export default function CallLogForm({ leadId, nextFollowUpAt, nextStepNote }: Props) {
  const boundAction = logCallOutcomeAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const hasPlannedState = nextFollowUpAt !== null || nextStepNote !== null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm font-medium text-begina-primary-900">Zápis po hovoru</p>

      {hasPlannedState && (
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 text-sm text-begina-primary-900">
          {nextFollowUpAt && (
            <p>
              Další kontakt: <span className="font-medium">{formatCzechDate(nextFollowUpAt)}</span>
            </p>
          )}
          {nextStepNote && (
            <p>
              Další krok: <span className="font-medium">{nextStepNote}</span>
            </p>
          )}
        </div>
      )}

      <textarea
        name="note"
        rows={2}
        placeholder="Co bylo domluveno…"
        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="nextStage" className="text-xs text-neutral-500 mb-1 block">
            Posunout fázi na
          </label>
          <select
            id="nextStage"
            name="nextStage"
            defaultValue=""
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
          >
            <option value="">Beze změny</option>
            {LEAD_STAGES.map((stage: LeadStage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nextFollowUpAt" className="text-xs text-neutral-500 mb-1 block">
            Další kontakt
          </label>
          <input
            id="nextFollowUpAt"
            name="nextFollowUpAt"
            type="date"
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
      </div>

      <div>
        <label htmlFor="nextStepNote" className="text-xs text-neutral-500 mb-1 block">
          Další krok
        </label>
        <input
          id="nextStepNote"
          name="nextStepNote"
          type="text"
          placeholder="Např. poslat vzorek, zavolat odpoledne…"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50 self-start"
      >
        {pending ? "Ukládám…" : "Uložit zápis"}
      </button>
    </form>
  );
}

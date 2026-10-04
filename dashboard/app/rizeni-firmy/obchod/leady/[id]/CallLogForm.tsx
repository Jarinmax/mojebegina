"use client";

import { useActionState } from "react";
import { logCallOutcomeAction, removeLeadFollowUpAction, type ActionState } from "../../actions";
import { LEAD_STAGES } from "@/lib/data/leadValidation";
import { STAGE_LABELS } from "../../leadLabels";
import { formatCzechDateTime } from "@/lib/format";
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
//
// Security Phase 20 (Google Kalendář 1.0) — datum i čas dalšího kontaktu
// (appka z termínu vytváří kalendářovou událost, potřebuje přesný čas, ne
// jen den), POVINNÉ SPOLEČNĚ, jakmile se vůbec vyplní (viz
// validateCallLogInput). Samostatné tlačítko "Odstranit naplánovaný
// kontakt" — prázdná pole v hlavním formuláři znamenají "neřešeno", ne
// "smazat", takže smazání potřebuje vlastní, jednoznačnou akci.
export default function CallLogForm({ leadId, nextFollowUpAt, nextStepNote }: Props) {
  const boundAction = logCallOutcomeAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const boundRemoveAction = removeLeadFollowUpAction.bind(null, leadId);
  const [removeState, removeFormAction, removePending] = useActionState(boundRemoveAction, initialState);

  const hasPlannedState = nextFollowUpAt !== null || nextStepNote !== null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm font-medium text-begina-primary-900">Zápis po hovoru</p>

      {hasPlannedState && (
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 text-sm text-begina-primary-900 flex flex-col gap-1">
          {nextFollowUpAt && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p>
                Další kontakt: <span className="font-medium">{formatCzechDateTime(nextFollowUpAt)}</span>
              </p>
              <button
                type="submit"
                formAction={removeFormAction}
                disabled={removePending}
                className="text-xs font-medium text-begina-accent-700 disabled:opacity-50"
              >
                {removePending ? "Odstraňuji…" : "Odstranit naplánovaný kontakt"}
              </button>
            </div>
          )}
          {nextStepNote && (
            <p>
              Další krok: <span className="font-medium">{nextStepNote}</span>
            </p>
          )}
        </div>
      )}
      {removeState && "error" in removeState && <p className="text-sm text-begina-accent-700">{removeState.error}</p>}

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
          <label htmlFor="nextFollowUpAtDate" className="text-xs text-neutral-500 mb-1 block">
            Další kontakt
          </label>
          <div className="flex gap-2">
            <input
              id="nextFollowUpAtDate"
              name="nextFollowUpAtDate"
              type="date"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
            />
            <input
              id="nextFollowUpAtTime"
              name="nextFollowUpAtTime"
              type="time"
              aria-label="Čas dalšího kontaktu"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
            />
          </div>
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

"use client";

import { useActionState, useState } from "react";
import { logCallOutcomeAction, type ActionState } from "../../actions";
import { formatCzechDate } from "@/lib/format";
import CallOutcomeFields from "../../CallOutcomeFields";

const initialState: ActionState = null;

type Props = {
  leadId: string;
  nextFollowUpAt: Date | null;
  nextStepNote: string | null;
};

// Security Phase 16 (Obchod/CRM 1.0) — rychlý zápis po hovoru.
//
// Jarda – volání a provize, část 1, bod 2 doplňku ("Jednotný zápis výsledku
// hovoru") — pole teď přesně odpovídají "Dnešnímu volání" (sdílená
// CallOutcomeFields, ../../CallOutcomeFields.tsx): výsledek hovoru je od
// teď POVINNÝ stejně jako tam (dřív tenhle formulář žádný výsledek vůbec
// nesbíral — appka ho tak nikdy neměla k dispozici pro Historii volání u
// hovorů zapsaných odsud). Validace (validateCallOutcomeInput,
// leadValidation.ts) je STEJNÁ funkce, jakou volá dailyCalls.ts.
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
  const [result, setResult] = useState("");

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

      <CallOutcomeFields result={result} onResultChange={setResult} />

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

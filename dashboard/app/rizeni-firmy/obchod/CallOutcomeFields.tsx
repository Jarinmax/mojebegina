"use client";

import { CALL_RESULTS, LEAD_STAGES, type CallResult, type LeadStage } from "@/lib/data/leadValidation";
import { STAGE_LABELS, CALL_RESULT_LABELS } from "./leadLabels";

type Props = {
  // Víc karet se stejnými poli může být na stránce zároveň (Dnešní volání —
  // jedna <form> na kontakt) — idPrefix drží htmlFor/id dvojice jedinečné.
  // CallLogForm (detail leadu, jedna instance na stránku) ho nechává
  // prázdný.
  idPrefix?: string;
  result: string;
  onResultChange: (value: string) => void;
};

// Jarda – volání a provize, část 1, bod 2 doplňku ("Jednotný zápis výsledku
// hovoru") — JEDINÁ sada polí pro obě obrazovky (dřív CallOutcomeForm.tsx
// a CallLogForm.tsx měly dvě nezávislé kopie, které se časem rozešly — bod
// 1 "Výsledek hovoru" na detailu leadu vůbec nebyl). Pořadí/popisky/
// chování (výsledek jako vynucená volba bez validní výchozí hodnoty,
// povinné datum jen u "Zavolat později") jsou teď na jednom místě.
// Zápisové volání ("Uložit výsledek"/"Uložit zápis"), expand/collapse a
// stav formuláře (useActionState) zůstávají v každém rodiči zvlášť — to
// není pole, to je chrome kolem nich.
export default function CallOutcomeFields({ idPrefix = "", result, onResultChange }: Props) {
  return (
    <>
      <div>
        <label htmlFor={`result${idPrefix}`} className="text-xs text-neutral-500 mb-1 block">
          Výsledek hovoru
        </label>
        <select
          id={`result${idPrefix}`}
          name="result"
          value={result}
          onChange={(e) => onResultChange(e.target.value)}
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
          <label htmlFor={`stageChange${idPrefix}`} className="text-xs text-neutral-500 mb-1 block">
            Posunout fázi na
          </label>
          <select
            id={`stageChange${idPrefix}`}
            name="nextStage"
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
          <label htmlFor={`nextFollowUpAt${idPrefix}`} className="text-xs text-neutral-500 mb-1 block">
            Další kontakt{result === "call_back_later" ? " (povinné)" : ""}
          </label>
          <input
            id={`nextFollowUpAt${idPrefix}`}
            name="nextFollowUpAt"
            type="date"
            required={result === "call_back_later"}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
          />
        </div>
      </div>

      <div>
        <label htmlFor={`nextStepNote${idPrefix}`} className="text-xs text-neutral-500 mb-1 block">
          Další krok
        </label>
        <input
          id={`nextStepNote${idPrefix}`}
          name="nextStepNote"
          type="text"
          placeholder="Např. poslat vzorek, zavolat odpoledne…"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>
    </>
  );
}

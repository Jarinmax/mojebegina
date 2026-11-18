"use client";

import { useActionState } from "react";
import { updateFocusProjectAction, type ActionState } from "../actions";
import { FOCUS_PRIORITIES, FOCUS_STATUSES } from "@/lib/data/ceoFocusValidation";
import { PRIORITY_LABELS, STATUS_LABELS } from "../focusLabels";
import type { FocusPriority, FocusStatus } from "@/lib/data/ceoFocusValidation";

const initialState: ActionState = null;

type Props = {
  projectId: string;
  description: string | null;
  nextStep: string | null;
  statusReason: string | null;
};

// Security Phase 17 (CEO přehled 1.0) — jeden formulář, jeden submit,
// stejný princip jako CallLogForm.tsx v CRM (Security Phase 16/16.5):
// všechna pole nepovinná, prázdný submit je odmítnutý na validaci
// (validateUpdateFocusProjectInput), a aktuální popis/další krok/blocker
// se zobrazují NAD formulářem nezávisle na tom, co je zrovna v polích —
// React po úspěšném submitu <form action> pole vyprázdní, takže by jinak
// nebylo vidět, že se aktualizace skutečně uložila.
export default function FocusUpdateForm({ projectId, description, nextStep, statusReason }: Props) {
  const boundAction = updateFocusProjectAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const hasPlannedState = description !== null || nextStep !== null || statusReason !== null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm font-medium text-begina-primary-900">Aktualizace projektu</p>

      {hasPlannedState && (
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 text-sm text-begina-primary-900 flex flex-col gap-1">
          {description && (
            <p>
              Aktuálně řešíme: <span className="font-medium">{description}</span>
            </p>
          )}
          {nextStep && (
            <p>
              Další krok: <span className="font-medium">{nextStep}</span>
            </p>
          )}
          {statusReason && (
            <p className="text-red-700">
              ⚠ <span className="font-medium">{statusReason}</span>
            </p>
          )}
        </div>
      )}

      <textarea
        name="note"
        rows={2}
        placeholder="Poznámka k téhle aktualizaci…"
        className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="focus-status" className="text-xs text-neutral-500 mb-1 block">
            Stav
          </label>
          <select
            id="focus-status"
            name="status"
            defaultValue=""
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
          >
            <option value="">Beze změny</option>
            {FOCUS_STATUSES.map((status: FocusStatus) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="focus-priority" className="text-xs text-neutral-500 mb-1 block">
            Priorita
          </label>
          <select
            id="focus-priority"
            name="priority"
            defaultValue=""
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
          >
            <option value="">Beze změny</option>
            {FOCUS_PRIORITIES.map((priority: FocusPriority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="focus-status-reason" className="text-xs text-neutral-500 mb-1 block">
          Blocker / důvod stavu (nepovinné)
        </label>
        <input
          id="focus-status-reason"
          name="statusReason"
          type="text"
          placeholder="Např. čekáme na podklady od dodavatele"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      <div>
        <label htmlFor="focus-description" className="text-xs text-neutral-500 mb-1 block">
          Na čem se právě pracuje
        </label>
        <textarea
          id="focus-description"
          name="description"
          rows={2}
          placeholder="Co se teď reálně řeší…"
          className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      <div>
        <label htmlFor="focus-next-step" className="text-xs text-neutral-500 mb-1 block">
          Nejbližší další krok
        </label>
        <input
          id="focus-next-step"
          name="nextStep"
          type="text"
          placeholder="Co je potřeba udělat příště…"
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
        {pending ? "Ukládám…" : "Uložit aktualizaci"}
      </button>
    </form>
  );
}

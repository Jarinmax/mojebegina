"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import {
  logCallOutcomeAction,
  removeLeadFollowUpAction,
  retryLeadCalendarSyncAction,
  type ActionState,
} from "../../actions";
import { LEAD_STAGES } from "@/lib/data/leadValidation";
import { STAGE_LABELS } from "../../leadLabels";
import { formatCzechDateTime } from "@/lib/format";
import type { LeadStage } from "@/lib/data/leadValidation";
import type { LeadCalendarSyncStatus } from "@/lib/data/leads";

const initialState: ActionState = null;

type Props = {
  leadId: string;
  nextFollowUpAt: Date | null;
  nextStepNote: string | null;
  calendarSync: LeadCalendarSyncStatus | null;
  /** Kontakt zatím nemá vlastníka — po „Dovolal/a jsem se“ se přiřadí volajícímu. */
  unowned?: boolean;
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
// Security Phase 20 (Google Kalendář 1.0) — datum a čas dalšího kontaktu
// (appka z termínu vytváří kalendářovou událost na konkrétní čas). Etapa 0:
// datum bez času = 09:00 Europe/Prague (viz pragueTime.ts:parseFollowUpInput). Samostatné tlačítko "Odstranit naplánovaný
// kontakt" — prázdná pole v hlavním formuláři znamenají "neřešeno", ne
// "smazat", takže smazání potřebuje vlastní, jednoznačnou akci.
// 22. 11. 2026 (Lucie, chyba u LumoKids): nic, co obchodník napíše, se nesmí
// ztratit. Pole jsou proto řízená stavem (React je po odeslání nevymaže),
// rozepsaný zápis se průběžně ukládá v prohlížeči (přežije i obnovení
// stránky nebo uložení jiného formuláře na kartě) a vymaže se až po
// úspěšném uložení. Čas je předvyplněný 9:00; když ho obchodník smaže a
// datum nechá, formulář se neodešle a u Času svítí „Doplňte čas“.
type Draft = { note: string; nextStage: string; date: string; time: string; nextStepNote: string; reached: boolean };
const DEFAULT_TIME = "09:00";
const emptyDraft = (): Draft => ({ note: "", nextStage: "", date: "", time: DEFAULT_TIME, nextStepNote: "", reached: false });
const draftKey = (leadId: string) => `mojebegina:zapis-po-hovoru:${leadId}`;

function readDraftRaw(leadId: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(leadId));
  } catch {
    return null;
  }
}

function writeDraft(leadId: string, d: Draft | null) {
  try {
    if (d && hasContent(d)) window.localStorage.setItem(draftKey(leadId), JSON.stringify(d));
    else window.localStorage.removeItem(draftKey(leadId));
  } catch {
    // prohlížeč bez úložiště — formulář funguje dál, jen bez zálohy
  }
}

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function hasContent(d: Draft): boolean {
  return Boolean(d.note.trim() || d.nextStage || d.date || d.nextStepNote.trim() || d.reached);
}

export default function CallLogForm({ leadId, nextFollowUpAt, nextStepNote, calendarSync, unowned = false }: Props) {
  // null = obchodník na formuláři zatím nic nezměnil (pak platí uložený rozepsaný zápis).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [timeMissing, setTimeMissing] = useState(false);

  const savedRaw = useSyncExternalStore(subscribeStorage, () => readDraftRaw(leadId), () => null);
  const saved = useMemo<Draft | null>(() => {
    if (!savedRaw) return null;
    try {
      const parsed = { ...emptyDraft(), ...(JSON.parse(savedRaw) as Partial<Draft>) };
      return hasContent(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [savedRaw]);

  const current: Draft = draft ?? saved ?? emptyDraft();
  const restored = draft === null && saved !== null;

  const boundAction = logCallOutcomeAction.bind(null, leadId);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await boundAction(prev, formData);
    // Vymazat až po úspěšném uložení na serveru.
    if (result && "success" in result) {
      setDraft(emptyDraft());
      writeDraft(leadId, null);
    }
    return result;
  }, initialState);

  const update = (patch: Partial<Draft>) => {
    const next = { ...current, ...patch };
    setDraft(next);
    writeDraft(leadId, next);
    if ("time" in patch || "date" in patch) setTimeMissing(false);
  };

  const boundRemoveAction = removeLeadFollowUpAction.bind(null, leadId);
  const [removeState, removeFormAction, removePending] = useActionState(boundRemoveAction, initialState);

  const boundRetryAction = retryLeadCalendarSyncAction.bind(null, leadId);
  const [retryState, retryFormAction, retryPending] = useActionState(boundRetryAction, initialState);

  const hasPlannedState = nextFollowUpAt !== null || nextStepNote !== null;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        // Kontrola jen pro hlavní „Uložit zápis“ (ne pro Odstranit / Zkusit znovu).
        if (submitter?.dataset.main === "1" && current.date && !current.time) {
          e.preventDefault();
          setTimeMissing(true);
        }
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-sm font-medium text-begina-primary-900">Zápis po hovoru</p>
      {restored && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Obnovený rozepsaný zápis — zatím není uložený. Zkontroluj ho a klikni na „Uložit zápis“.
        </p>
      )}

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

      {calendarSync?.status === "failed" && !(retryState && "success" in retryState) && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-center justify-between gap-2 flex-wrap">
          <p>
            Synchronizace s Google kalendářem se nezdařila
            {calendarSync.lastError ? `: ${calendarSync.lastError}` : "."}
          </p>
          <button
            type="submit"
            formAction={retryFormAction}
            disabled={retryPending}
            className="text-xs font-medium text-begina-primary-900 disabled:opacity-50 shrink-0"
          >
            {retryPending ? "Zkouším znovu…" : "Zkusit znovu"}
          </button>
        </div>
      )}
      {retryState && "error" in retryState && <p className="text-sm text-begina-accent-700">{retryState.error}</p>}
      {retryState && "success" in retryState && <p className="text-sm text-emerald-700">{retryState.success}</p>}

      <textarea
        name="note"
        value={current.note}
        onChange={(e) => update({ note: e.target.value })}
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
            value={current.nextStage}
            onChange={(e) => update({ nextStage: e.target.value })}
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
              value={current.date}
              onChange={(e) => update({ date: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
            />
            <input
              id="nextFollowUpAtTime"
              name="nextFollowUpAtTime"
              type="time"
              value={current.time}
              onChange={(e) => update({ time: e.target.value })}
              aria-label="Čas dalšího kontaktu"
              aria-invalid={timeMissing}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-begina-primary-900 ${
                timeMissing ? "border-red-500 bg-red-50" : "border-neutral-200"
              }`}
            />
          </div>
          {timeMissing ? (
            <p className="text-xs font-medium text-red-700 mt-1">Doplňte čas</p>
          ) : (
            <p className="text-xs text-neutral-400 mt-1">Čas je předvyplněný na 9:00. Bez data zůstane termín beze změny.</p>
          )}
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
          value={current.nextStepNote}
          onChange={(e) => update({ nextStepNote: e.target.value })}
          placeholder="Např. poslat vzorek, zavolat odpoledne…"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
        />
      </div>

      {unowned && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-begina-primary-900">
          <input
            type="checkbox"
            name="reached"
            value="1"
            checked={current.reached}
            onChange={(e) => update({ reached: e.target.checked })}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Dovolal/a jsem se
            <span className="block text-xs text-neutral-600">Kontakt zatím nikomu nepatří — po uložení se přiřadí vám.</span>
          </span>
        </label>
      )}

      {state && "error" in state && <p className="text-sm text-begina-accent-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}

      {state && "error" in state && <p className="text-xs text-neutral-600">Nic z toho, co jsi napsal/a, se neztratilo — oprav chybu a ulož znovu.</p>}

      <button
        type="submit"
        data-main="1"
        disabled={pending}
        className="w-full text-base font-semibold text-begina-primary-50 bg-begina-primary-900 rounded-xl px-4 py-3 disabled:opacity-50"
      >
        {pending ? "Ukládám…" : "Uložit zápis"}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { dispatchAction, type ActionState } from "./actions";
import type { DispatchView } from "./dispatchText";

// „Odesláno“ a „Faktura poslána“ (Lucie 18. 11. 2026) — velká zaškrtávátka
// (na mobilu přes celou šířku, nic neujíždí do strany). Vrátit zpět jde
// vždy, s potvrzením přímo v kartě (žádné prohlížečové dialogy).

const initialState: ActionState = null;

function Box({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex-none w-8 h-8 rounded-lg border-2 flex items-center justify-center text-lg leading-none ${
        done ? "bg-emerald-600 border-emerald-600 text-white" : "border-neutral-400 bg-white"
      }`}
    >
      {done ? "✓" : ""}
    </span>
  );
}

function Check({
  orderId,
  kind,
  done,
  title,
  lines,
  hint,
  withTracking,
  trackingNumber,
}: {
  orderId: string;
  kind: "ship" | "invoice";
  done: boolean;
  title: string;
  lines: string[];
  hint: string;
  withTracking?: boolean;
  trackingNumber?: string | null;
}) {
  const [state, formAction, pending] = useActionState(dispatchAction.bind(null, orderId), initialState);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [processed, setProcessed] = useState(state);
  if (state !== processed) {
    setProcessed(state);
    setConfirmUndo(false);
  }
  const undoOp = kind === "ship" ? "unship" : "uninvoice";

  if (done) {
    return (
      <div className="flex gap-3 items-start rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 min-w-0">
        <Box done />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-begina-primary-900">{title}</p>
          {lines.map((line) => (
            <p key={line} className="text-xs text-neutral-600 break-words">
              {line}
            </p>
          ))}
          {!confirmUndo ? (
            <button
              type="button"
              onClick={() => setConfirmUndo(true)}
              className="mt-1.5 text-sm text-red-700 underline py-1"
            >
              Vrátit zpět
            </button>
          ) : (
            <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="op" value={undoOp} />
              <span className="text-sm text-neutral-700">Opravdu vrátit?</span>
              <button
                type="submit"
                disabled={pending}
                className="text-sm font-medium text-white bg-red-700 rounded-lg px-4 py-2 disabled:opacity-50"
              >
                {pending ? "Vracím…" : "Ano, vrátit"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmUndo(false)}
                className="text-sm text-neutral-600 px-3 py-2"
              >
                Ne
              </button>
            </form>
          )}
          {state && "error" in state && <p className="text-xs text-red-700 mt-1">{state.error}</p>}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-xl border-2 border-neutral-200 bg-white p-3 min-w-0">
      <input type="hidden" name="op" value={kind} />
      <button type="submit" disabled={pending} className="w-full flex gap-3 items-start text-left disabled:opacity-60">
        <Box done={false} />
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-medium text-begina-primary-900">
            {pending ? "Ukládám…" : title}
          </span>
          <span className="block text-xs text-neutral-500">{hint}</span>
        </span>
      </button>
      {withTracking && (
        <input
          name="trackingNumber"
          defaultValue={trackingNumber ?? ""}
          placeholder="Číslo zásilky (nepovinné)"
          maxLength={80}
          className="mt-2 w-full px-3 py-2.5 border border-neutral-300 rounded-lg text-[15px] text-begina-primary-900"
        />
      )}
      {state && "error" in state && <p className="text-xs text-red-700 mt-1">{state.error}</p>}
    </form>
  );
}

export default function DispatchChecks({ view }: { view: DispatchView }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Check
        orderId={view.orderId}
        kind="ship"
        done={view.shipped.done}
        title={view.shipped.title}
        lines={view.shipped.lines}
        hint="Klepni, až to předáš CoolBalíku / dopravci"
        withTracking
        trackingNumber={view.trackingNumber}
      />
      <Check
        orderId={view.orderId}
        kind="invoice"
        done={view.invoice.done}
        title={view.invoice.title}
        lines={view.invoice.lines}
        hint="Zaškrtne se samo po odeslání e-mailem z MojeBegina. Ručně např. při předání osobně."
      />
    </div>
  );
}

/**
 * Kompaktní dlaždice pro stránku Výroba: zaškrtnout jedním klepnutím,
 * vrátit zpět s potvrzením. Číslo zásilky se doplňuje v detailu objednávky.
 */
export function DispatchTile({
  orderId,
  kind,
  done,
  doneNote,
}: {
  orderId: string;
  kind: "ship" | "invoice";
  done: boolean;
  doneNote: string | null;
}) {
  const [state, formAction, pending] = useActionState(dispatchAction.bind(null, orderId), initialState);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [processed, setProcessed] = useState(state);
  if (state !== processed) {
    setProcessed(state);
    setConfirmUndo(false);
  }
  const title = kind === "ship" ? "Odesláno" : "Faktura poslána";
  const op = done ? (kind === "ship" ? "unship" : "uninvoice") : kind;

  return (
    <form
      action={formAction}
      className={`rounded-xl border-2 p-2 text-center min-h-[72px] flex flex-col items-center justify-center gap-1 ${
        done ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-dashed border-neutral-300 text-neutral-600"
      }`}
    >
      <input type="hidden" name="op" value={op} />
      <span className="text-sm font-medium">{done ? `✓ ${title}` : title}</span>
      {done && doneNote && <span className="text-[11px] leading-tight">{doneNote}</span>}
      {!done && (
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-white bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Ukládám…" : "Zaškrtnout"}
        </button>
      )}
      {done && !confirmUndo && (
        <button type="button" onClick={() => setConfirmUndo(true)} className="text-xs text-red-700 underline py-1">
          Vrátit zpět
        </button>
      )}
      {done && confirmUndo && (
        <span className="flex flex-wrap justify-center gap-1">
          <button
            type="submit"
            disabled={pending}
            className="text-xs font-medium text-white bg-red-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? "…" : "Ano, vrátit"}
          </button>
          <button type="button" onClick={() => setConfirmUndo(false)} className="text-xs text-neutral-600 px-2 py-1.5">
            Ne
          </button>
        </span>
      )}
      {state && "error" in state && <span className="text-[11px] text-red-700">{state.error}</span>}
    </form>
  );
}

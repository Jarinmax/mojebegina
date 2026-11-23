"use client";

import { useActionState } from "react";
import { invoiceAction, type InvoiceActionState } from "./actions";

type Props = { number: string; paid: boolean; cancelled: boolean; canDelete: boolean; today: string };

const btn = "text-xs rounded-lg border px-2.5 py-1.5";

export default function InvoiceActions({ number, paid, cancelled, canDelete, today }: Props) {
  const [state, action, pending] = useActionState<InvoiceActionState, FormData>(invoiceAction, null);
  if (cancelled) return null;
  return (
    <details className="text-left">
      <summary className="text-xs text-begina-primary-900 underline cursor-pointer select-none">Upravit</summary>
      <div className="mt-2 space-y-2 bg-neutral-50 border border-neutral-200 rounded-lg p-2">
        {paid ? (
          <form action={action}>
            <input type="hidden" name="number" value={number} />
            <input type="hidden" name="kind" value="unpaid" />
            <button disabled={pending} className={`${btn} bg-white border-neutral-300`}>Vrátit na neuhrazenou</button>
          </form>
        ) : (
          <form action={action} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="number" value={number} />
            <input type="hidden" name="kind" value="paid" />
            <input type="date" name="paidDate" defaultValue={today} max={today} className="text-xs border border-neutral-300 rounded-lg px-2 py-1" />
            <button disabled={pending} className={`${btn} bg-begina-primary-900 text-white border-begina-primary-900`}>Uhrazeno</button>
          </form>
        )}
        <form action={action} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="number" value={number} />
          <input type="hidden" name="kind" value="cancel" />
          <input name="reason" required placeholder="Důvod storna" className="text-xs border border-neutral-300 rounded-lg px-2 py-1 min-w-0 flex-1" />
          <button disabled={pending} className={`${btn} bg-white border-red-300 text-red-700`}>Stornovat</button>
        </form>
        {canDelete && (
          <form action={action}>
            <input type="hidden" name="number" value={number} />
            <input type="hidden" name="kind" value="delete" />
            <button disabled={pending} className={`${btn} bg-white border-red-300 text-red-700`}>Smazat (číslo se uvolní)</button>
          </form>
        )}
        {state && <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
      </div>
    </details>
  );
}

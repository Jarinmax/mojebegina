"use client";

import { useActionState } from "react";
import {
  addStockRequestAction,
  assignProductionCardAction,
  inviteProductionCollaboratorAction,
  resolveStockRequestAction,
  type ProductionActionState,
} from "./actions";

const input = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-base text-begina-primary-900";

function Result({ state }: { state: ProductionActionState }) {
  if (!state) return null;
  return "error" in state
    ? <p className="text-sm text-red-700">{state.error}</p>
    : <p className="text-sm text-emerald-700">{state.success}</p>;
}

export function StockRequestForm({ ingredients }: { ingredients: ReadonlyArray<{ id: string; name: string; canonicalUnit: string }> }) {
  const [state, action, pending] = useActionState(addStockRequestAction, null);
  return <details className="rounded-xl border border-neutral-200 bg-white p-4">
    <summary className="cursor-pointer font-medium text-begina-primary-900">+ Žádost o doplnění / přípravu suroviny</summary>
    <form action={action} className="mt-3 grid gap-3">
      <select name="stockItemId" className={input} defaultValue="">
        <option value="">Jiná / nová surovina (popiš v poznámce)</option>
        {ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.canonicalUnit})</option>)}
      </select>
      <textarea name="note" required maxLength={500} rows={3} placeholder="Co je potřeba doplnit nebo připravit a proč" className={input} />
      <Result state={state} />
      <button disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? "Odesílám…" : "Odeslat žádost"}</button>
    </form>
  </details>;
}

export function ResolveRequestForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(resolveStockRequestAction, null);
  return <form action={action} className="mt-1 flex items-center gap-2">
    <input type="hidden" name="requestId" value={requestId} />
    <button disabled={pending} className="rounded-lg border border-begina-primary-900 px-3 py-1.5 text-xs font-medium text-begina-primary-900 disabled:opacity-50">{pending ? "Ukládám…" : "Vyřízeno"}</button>
    {state && "error" in state && <span className="text-xs text-red-700">{state.error}</span>}
  </form>;
}

export function InviteProductionForm() {
  const [state, action, pending] = useActionState(inviteProductionCollaboratorAction, null);
  return <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <div>
      <p className="font-medium text-begina-primary-900">Petrův účet zatím není připojený</p>
      <p className="mt-1 text-sm text-neutral-600">Appka založí účet a rovnou pošle Petrovi e-mail s odkazem na nastavení hesla. Karta se mu propojí sama.</p>
    </div>
    <form action={action} className="grid gap-3">
      <input name="name" required maxLength={200} placeholder="Jméno Petra" className={input} />
      <input name="email" type="email" required placeholder="E-mail Petra" className={input} />
      <Result state={state} />
      <button disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? "Posílám pozvánku…" : "Pozvat do výroby"}</button>
    </form>
    <details>
      <summary className="cursor-pointer text-sm text-neutral-600">Petr už má účet pod jiným e-mailem?</summary>
      <AssignProductionCardForm />
    </details>
  </div>;
}

export function AssignProductionCardForm() {
  const [state, action, pending] = useActionState(assignProductionCardAction, null);
  return <form action={action} className="mt-3 grid gap-3">
    <input name="email" type="email" required placeholder="E-mail existujícího účtu" className={input} />
    <Result state={state} />
    <button disabled={pending} className="min-h-11 rounded-lg border border-begina-primary-900 px-4 text-sm font-medium text-begina-primary-900 disabled:opacity-50">{pending ? "Přiřazuji…" : "Přiřadit existující účet"}</button>
  </form>;
}

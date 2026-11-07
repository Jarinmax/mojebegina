"use client";

import { useActionState } from "react";
import {
  addPayoutAction,
  addProductMovementAction,
  addWorkEntryAction,
  assignCardAction,
  type CollaboratorActionState,
} from "./actions";

const input = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-base text-begina-primary-900";

function Result({ state }: { state: CollaboratorActionState }) {
  if (!state) return null;
  return "error" in state
    ? <p className="text-sm text-red-700">{state.error}</p>
    : <p className="text-sm text-emerald-700">{state.success}</p>;
}

export function WorkEntryForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addWorkEntryAction, null);
  return <details className="rounded-xl border border-neutral-200 bg-white p-4">
    <summary className="cursor-pointer font-medium text-begina-primary-900">+ Zapsat práci / příspěvek</summary>
    <form action={action} className="mt-3 grid gap-3">
      <input name="description" required maxLength={500} placeholder="Co bylo vytvořeno" className={input} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500">Počet příspěvků<input name="postCount" type="number" min="0" defaultValue="1" className={`${input} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Čas v minutách<input name="durationMinutes" type="number" min="0" required className={`${input} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Odměna Kč<input name="earnedKc" type="number" min="0" defaultValue="0" className={`${input} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Datum<input name="occurredOn" type="date" defaultValue={today} required className={`${input} mt-1`} /></label>
      </div>
      <Result state={state} />
      <button disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? "Ukládám…" : "Uložit práci"}</button>
    </form>
  </details>;
}

export function ProductMovementForm({ products, kind }: { products: ReadonlyArray<{ id: string; name: string }>; kind: "stock_in" | "sale" }) {
  const [state, action, pending] = useActionState(addProductMovementAction, null);
  const sale = kind === "sale";
  return <details className="rounded-xl border border-neutral-200 bg-white p-4">
    <summary className="cursor-pointer font-medium text-begina-primary-900">{sale ? "+ Zapsat prodej" : "+ Naskladnit produkty"}</summary>
    <form action={action} className="mt-3 grid gap-3">
      <input type="hidden" name="kind" value={kind} />
      <select name="productId" required className={input}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500">Počet kusů<input name="quantity" type="number" min="1" required className={`${input} mt-1`} /></label>
        {sale && <label className="text-xs text-neutral-500">Cena za kus Kč<input name="unitSalePriceKc" type="number" min="0" required className={`${input} mt-1`} /></label>}
      </div>
      <input name="note" maxLength={500} placeholder="Poznámka (nepovinná)" className={input} />
      <Result state={state} />
      <button disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? "Ukládám…" : sale ? "Uložit prodej" : "Uložit příjem"}</button>
    </form>
  </details>;
}

export function PayoutForm({ remainingKc }: { remainingKc: number }) {
  const [state, action, pending] = useActionState(addPayoutAction, null);
  return <details className="rounded-xl border border-neutral-200 bg-white p-4">
    <summary className="cursor-pointer font-medium text-begina-primary-900">+ Zapsat výplatu</summary>
    <form action={action} className="mt-3 grid gap-3">
      <label className="text-xs text-neutral-500">Částka Kč<input name="amountKc" type="number" min="1" max={Math.max(0, remainingKc)} required className={`${input} mt-1`} /></label>
      <input name="note" maxLength={500} placeholder="Poznámka (nepovinná)" className={input} />
      <Result state={state} />
      <button disabled={pending || remainingKc <= 0} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? "Ukládám…" : "Uložit výplatu"}</button>
    </form>
  </details>;
}

export function AssignCardForm() {
  const [state, action, pending] = useActionState(assignCardAction, null);
  return <form action={action} className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <div><p className="font-medium text-begina-primary-900">Luciin účet zatím není připojený</p><p className="mt-1 text-sm text-neutral-600">Po pozvání zadejte stejný e-mail a karta se jí zobrazí po přihlášení.</p></div>
    <input name="email" type="email" required placeholder="E-mail Lucie" className={input} />
    <Result state={state} />
    <button disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? "Přiřazuji…" : "Přiřadit pozvaný účet"}</button>
  </form>;
}


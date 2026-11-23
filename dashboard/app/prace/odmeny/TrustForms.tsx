"use client";

import { useActionState, useState } from "react";
import { addTrustEntryAction, setRecurringAction, type TrustActionState } from "./actions";

const input = "w-full min-h-11 px-3 border border-neutral-200 rounded-lg bg-white text-sm text-begina-primary-900";

/** Zápis vkladu nebo jednorázové platby ze svěřených peněz (Viner, Lucie). */
export function TrustEntryForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<TrustActionState, FormData>(addTrustEntryAction, null);
  const [kind, setKind] = useState("withdrawal");
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium text-begina-primary-900">Zapsat pohyb</p>
      <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
        <option value="withdrawal">Platba ze svěřených peněz (−)</option>
        <option value="deposit">Vklad – Jarda svěřil další peníze (+)</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input name="amountKc" type="number" min={1} step={1} required placeholder="Částka v Kč" className={input} />
        <input name="entryDate" type="date" required defaultValue={today} className={input} />
      </div>
      <input
        name="description"
        type="text"
        required
        maxLength={300}
        placeholder={kind === "deposit" ? "Popis vkladu" : "Za co se platilo"}
        className={input}
      />
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button type="submit" disabled={pending} className="self-start min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-begina-primary-50 disabled:opacity-50">
        {pending ? "Ukládám…" : "Zapsat"}
      </button>
    </form>
  );
}

/** Pravidelná platba ze svěřených peněz, odečítá se automaticky každý měsíc (Viner, Lucie). */
export function RecurringForm({
  current,
  defaultMonth,
}: {
  current: { label: string; amountKc: number; dayOfMonth: number } | null;
  defaultMonth: string;
}) {
  const [state, action, pending] = useActionState<TrustActionState, FormData>(setRecurringAction, null);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium text-begina-primary-900">{current ? "Změnit pravidelnou platbu" : "Nastavit pravidelnou platbu"}</p>
      <p className="text-xs text-neutral-500">Odečítá se automaticky ke zvolenému dni každého měsíce od zvoleného měsíce. Dřívější platby zůstanou, jak byly.</p>
      <input name="label" type="text" required maxLength={80} defaultValue={current?.label} placeholder="Název platby" className={input} />
      <div className="grid grid-cols-3 gap-2">
        <input name="amountKc" type="number" min={1} step={1} required defaultValue={current?.amountKc} placeholder="Kč" className={input} />
        <input name="dayOfMonth" type="number" min={1} max={28} step={1} required defaultValue={current?.dayOfMonth ?? 15} aria-label="Den v měsíci" className={input} />
        <input name="fromMonth" type="month" required defaultValue={defaultMonth} aria-label="Od měsíce" className={input} />
      </div>
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button type="submit" disabled={pending} className="self-start min-h-11 rounded-lg border border-begina-primary-200 px-4 text-sm font-medium text-begina-primary-900 disabled:opacity-50">
        {pending ? "Ukládám…" : "Uložit"}
      </button>
    </form>
  );
}

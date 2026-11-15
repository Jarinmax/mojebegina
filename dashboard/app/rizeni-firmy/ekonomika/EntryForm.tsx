"use client";

import { useActionState, useState } from "react";
import { PAYMENT_FORMS, type EconomyKind } from "@/lib/ekonomika/economy";
import { addEconomyEntryAction, type EconomyActionState } from "./actions";

const input = "w-full min-w-0 box-border appearance-none rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white text-neutral-900 min-h-10";
const label = "flex flex-col gap-1 min-w-0 text-xs font-medium text-neutral-600";

export default function EntryForm({ today, initialKind }: { today: string; initialKind: EconomyKind }) {
  const [state, action, pending] = useActionState<EconomyActionState, FormData>(addEconomyEntryAction, null);
  const [kind, setKind] = useState<EconomyKind>(initialKind);
  const isCost = kind === "cost";
  const tab = (value: EconomyKind, text: string) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      aria-pressed={kind === value}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${kind === value ? "bg-begina-primary-900 text-white" : "bg-neutral-100 text-neutral-700"}`}
    >
      {text}
    </button>
  );

  return (
    <form action={action} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex gap-2">
        {tab("cost", "+ Náklad")}
        {tab("income", "+ Příjem")}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className={label}>
          Datum
          <input className={input} type="date" name="entryDate" defaultValue={today} required />
        </label>
        <label className={label}>
          Částka (Kč)
          <input className={input} name="amount" inputMode="decimal" placeholder="1 250" required />
        </label>
        <label className={`${label} col-span-2`}>
          {isCost ? "Co se kupovalo" : "Za co (typ příjmu)"}
          <input className={input} name="title" placeholder={isCost ? "např. cukr, lahve, nájem" : "např. e-shop, bistro, akce"} required />
        </label>
        <label className={`${label} col-span-2`}>
          {isCost ? "Prodávající" : "Klient"}
          <input className={input} name="counterparty" />
        </label>
        {!isCost && (
          <>
            <label className={label}>
              Forma úhrady
              <select className={input} name="paymentForm" defaultValue="">
                <option value="">—</option>
                {PAYMENT_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Číslo faktury
              <input className={input} name="invoiceNumber" />
            </label>
            <label className={label}>
              Cena bez dopravy (Kč)
              <input className={input} name="amountNoShipping" inputMode="decimal" />
            </label>
          </>
        )}
        <label className={`${label} col-span-2 ${isCost ? "" : "sm:col-span-3"}`}>
          Poznámka
          <input className={input} name="note" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-begina-primary-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60">
          {pending ? "Ukládám…" : isCost ? "Zapsat náklad" : "Zapsat příjem"}
        </button>
        {state && ("error" in state ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : <p role="status" className="text-sm text-green-800">{state.success}</p>)}
      </div>
    </form>
  );
}

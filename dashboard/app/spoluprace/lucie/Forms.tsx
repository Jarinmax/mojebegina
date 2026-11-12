"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  addPayoutAction,
  addProductMovementAction,
  addWorkEntryAction,
  assignCardAction,
  deleteWorkEntryAction,
  inviteCollaboratorAction,
  updateWorkEntryAction,
  type CollaboratorActionState,
} from "./actions";

const input = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-base text-begina-primary-900";
const kc = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 });
const REWARD_LABELS: Record<string, string> = { hourly: "hodinová sazba", per_post: "cena za příspěvek", flat: "zapsaná částka" };

function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

function Result({ state }: { state: CollaboratorActionState }) {
  if (!state) return null;
  return "error" in state
    ? <p className="text-sm text-red-700">{state.error}</p>
    : <p className="text-sm text-emerald-700">{state.success}</p>;
}

/** Typ odměny + sazba + množství → živý přepočet částky (server počítá to samé při uložení). */
function RewardFields({
  defaultRewardType,
  defaultRateKc,
  defaultPostCount,
  defaultDurationMinutes,
}: {
  defaultRewardType: "hourly" | "per_post";
  defaultRateKc: number;
  defaultPostCount: number;
  defaultDurationMinutes: number;
}) {
  const [rewardType, setRewardType] = useState<"hourly" | "per_post">(defaultRewardType);
  const [rateKc, setRateKc] = useState(defaultRateKc);
  const [postCount, setPostCount] = useState(defaultPostCount);
  const [durationMinutes, setDurationMinutes] = useState(defaultDurationMinutes);
  const earnedKc = rewardType === "hourly" ? Math.round((rateKc * durationMinutes) / 60) : rateKc * postCount;
  return <>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs text-neutral-500">Typ odměny
        <select name="rewardType" value={rewardType} onChange={(e) => setRewardType(e.target.value as "hourly" | "per_post")} className={`${input} mt-1`}>
          <option value="per_post">Cena za příspěvek</option>
          <option value="hourly">Hodinová sazba</option>
        </select>
      </label>
      <label className="text-xs text-neutral-500">Sazba Kč
        <input name="rateKc" type="number" min="1" required value={rateKc || ""} onChange={(e) => setRateKc(Number(e.target.value))} className={`${input} mt-1`} />
      </label>
      <label className="text-xs text-neutral-500">Počet příspěvků
        <input name="postCount" type="number" min="0" value={postCount} onChange={(e) => setPostCount(Number(e.target.value))} className={`${input} mt-1`} />
      </label>
      <label className="text-xs text-neutral-500">Čas v minutách
        <input name="durationMinutes" type="number" min="0" required value={durationMinutes || ""} onChange={(e) => setDurationMinutes(Number(e.target.value))} className={`${input} mt-1`} />
      </label>
    </div>
    <p className="text-xs text-neutral-500">Vyjde odměna: <strong className="text-begina-primary-900">{kc.format(earnedKc)}</strong></p>
  </>;
}

export function WorkEntryForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addWorkEntryAction, null);
  return <details className="rounded-xl border border-neutral-200 bg-white p-4">
    <summary className="cursor-pointer font-medium text-begina-primary-900">+ Zapsat práci / příspěvek</summary>
    <form action={action} className="mt-3 grid gap-3">
      <input name="description" required maxLength={500} placeholder="Co bylo vytvořeno" className={input} />
      <RewardFields defaultRewardType="per_post" defaultRateKc={0} defaultPostCount={1} defaultDurationMinutes={0} />
      <label className="text-xs text-neutral-500">Datum<input name="occurredOn" type="date" defaultValue={today} required className={`${input} mt-1`} /></label>
      <Result state={state} />
      <button disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? "Ukládám…" : "Uložit práci"}</button>
    </form>
  </details>;
}

export type WorkEntryRowData = {
  id: string;
  description: string;
  postCount: number;
  durationMinutes: number;
  rewardType: string;
  rateKc: number | null;
  earnedKc: number;
  occurredOn: string;
  locked: boolean;
};

export function WorkEntryRow({ entry }: { entry: WorkEntryRowData }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(updateWorkEntryAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteWorkEntryAction, null);

  if (editing) {
    return <form action={updateAction} className="rounded-lg border border-begina-primary-300 bg-white p-3 grid gap-2">
      <input type="hidden" name="id" value={entry.id} />
      <input name="description" required maxLength={500} defaultValue={entry.description} className={input} />
      <RewardFields
        defaultRewardType={entry.rewardType === "flat" ? "per_post" : (entry.rewardType as "hourly" | "per_post")}
        defaultRateKc={entry.rateKc ?? 0}
        defaultPostCount={entry.postCount}
        defaultDurationMinutes={entry.durationMinutes}
      />
      <label className="text-xs text-neutral-500">Datum<input name="occurredOn" type="date" defaultValue={entry.occurredOn} required className={`${input} mt-1`} /></label>
      <Result state={updateState} />
      <div className="flex gap-2">
        <button type="submit" disabled={updatePending} className="min-h-9 rounded-lg bg-begina-primary-900 px-3 text-xs font-medium text-white disabled:opacity-50">{updatePending ? "Ukládám…" : "Uložit změny"}</button>
        <button type="button" onClick={() => setEditing(false)} className="min-h-9 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700">Zrušit</button>
      </div>
    </form>;
  }

  return <div className="rounded-lg border border-neutral-200 bg-white p-3">
    <div className="flex justify-between gap-2">
      <p className="font-medium text-begina-primary-900">{entry.description}</p>
      <p className="text-sm font-medium">{kc.format(entry.earnedKc)}</p>
    </div>
    <p className="mt-1 text-xs text-neutral-500">
      {entry.occurredOn} · {entry.postCount} příspěvků · {hours(entry.durationMinutes)} · {REWARD_LABELS[entry.rewardType] ?? entry.rewardType}
      {entry.rateKc ? ` (${entry.rateKc} Kč)` : ""}
    </p>
    {entry.locked ? (
      <p className="mt-2 text-xs text-emerald-700">Proplaceno — nejde běžně upravit ani smazat.</p>
    ) : (
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-begina-primary-900 hover:underline">Upravit</button>
        <form action={deleteAction} className="inline">
          <input type="hidden" name="id" value={entry.id} />
          <button
            type="submit"
            disabled={deletePending}
            onClick={(e) => { if (!confirm("Opravdu smazat tenhle záznam práce?")) e.preventDefault(); }}
            className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
          >
            {deletePending ? "Mažu…" : "Smazat"}
          </button>
        </form>
      </div>
    )}
    {deleteState && "error" in deleteState && <p className="mt-1 text-xs text-red-700">{deleteState.error}</p>}
  </div>;
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

export function InviteCollaboratorForm() {
  const [state, action, pending] = useActionState(inviteCollaboratorAction, null);
  return <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <div>
      <p className="font-medium text-begina-primary-900">Luciin účet zatím není připojený</p>
      <p className="mt-1 text-sm text-neutral-600">Appka založí účet a rovnou pošle Lucii e-mail s odkazem na nastavení hesla. Karta se jí propojí sama.</p>
    </div>
    <form action={action} className="grid gap-3">
      <input name="name" required maxLength={200} placeholder="Jméno Lucie" className={input} />
      <input name="email" type="email" required placeholder="E-mail Lucie" className={input} />
      <Result state={state} />
      <button disabled={pending} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? "Posílám pozvánku…" : "Pozvat spolupracovnici"}</button>
    </form>
    <details>
      <summary className="cursor-pointer text-sm text-neutral-600">Lucie už má účet pod jiným e-mailem?</summary>
      <AssignCardForm />
    </details>
  </div>;
}

export function AssignCardForm() {
  const [state, action, pending] = useActionState(assignCardAction, null);
  return <form action={action} className="mt-3 grid gap-3">
    <input name="email" type="email" required placeholder="E-mail existujícího účtu" className={input} />
    <Result state={state} />
    <button disabled={pending} className="min-h-11 rounded-lg border border-begina-primary-900 px-4 text-sm font-medium text-begina-primary-900 disabled:opacity-50">{pending ? "Přiřazuji…" : "Přiřadit existující účet"}</button>
  </form>;
}


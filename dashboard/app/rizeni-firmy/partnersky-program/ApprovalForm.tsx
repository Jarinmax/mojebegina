"use client";

import { useActionState } from "react";
import { addPartnerOptOutAction, approvePartnerMonthAction, type PartnerActionState } from "./actions";

export type ApprovalRow = {
  key: string;
  name: string;
  emails: string[];
  orders: number;
  totalKc: number;
  goodsKc: number;
  tierLabel: string;
  /** null = individuální dohoda */
  percent: number | null;
  individual: number | null;
  salutation: string;
  optedOut: boolean;
  sent: boolean;
};

const kc = (value: number) => `${Math.round(value).toLocaleString("cs-CZ")} Kč`;

function Message({ state }: { state: PartnerActionState }) {
  if (!state) return null;
  return "error" in state ? (
    <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
  ) : (
    <p role="status" className="text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2">{state.success}</p>
  );
}

export default function ApprovalForm({ month, rows }: { month: string; rows: ApprovalRow[] }) {
  const [state, action, pending] = useActionState(approvePartnerMonthAction, null);
  const [optState, optAction, optPending] = useActionState(addPartnerOptOutAction, null);
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="month" value={month} />
        {/* 19. 11. 2026 (Lucie): jedna mřížka — na počítači řádky jako tabulka, na mobilu karta pod sebou (pole jen jednou, aby se formulář neodesílal dvakrát). */}
        <div className="text-sm">
          <div className="hidden lg:grid lg:grid-cols-[2rem_minmax(0,1fr)_5.5rem_7rem_8rem_11rem_12rem] gap-x-3 border-b border-neutral-300 py-2 font-semibold">
            <span>#</span>
            <span>Zákazník</span>
            <span className="text-right">Objednávek</span>
            <span className="text-right">S dopravou</span>
            <span className="text-right">Zboží bez dopravy</span>
            <span>Sleva na další měsíc</span>
            <span>Oslovení v e-mailu</span>
          </div>
          {rows.map((row, index) => (
            <div
              key={row.key}
              className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-neutral-200 py-3 lg:grid-cols-[2rem_minmax(0,1fr)_5.5rem_7rem_8rem_11rem_12rem] lg:items-start lg:py-2"
            >
              <span className="hidden lg:block">{index + 1}</span>
              <div className="col-span-2 lg:col-span-1 min-w-0">
                <div className="font-medium break-words">
                  <span className="lg:hidden text-neutral-500 font-normal mr-1">{index + 1}.</span>
                  {row.name}
                </div>
                <div className="text-neutral-500 break-words">{row.emails.join(", ") || "bez e-mailu"}</div>
                {row.optedOut && <div className="text-amber-700">odhlášen z e-mailů — slevu má, e-mail nedostane</div>}
                {row.sent && <div className="text-green-700">e-mail odeslán</div>}
              </div>
              <span className="text-neutral-500 lg:hidden">Objednávek</span>
              <span className="text-right tabular-nums">{row.orders}</span>
              <span className="text-neutral-500 lg:hidden">S dopravou</span>
              <span className="text-right tabular-nums">{kc(row.totalKc)}</span>
              <span className="text-neutral-500 lg:hidden">Zboží bez dopravy</span>
              <span className="text-right tabular-nums font-medium">{kc(row.goodsKc)}</span>
              <span className="text-neutral-500 lg:hidden">Sleva</span>
              <div className="text-right lg:text-left">
                {row.percent === null ? (
                  <label className="inline-flex items-center gap-2">
                    <span>individuální sleva</span>
                    <input
                      name={`percent:${row.key}`}
                      defaultValue={row.individual ?? ""}
                      inputMode="decimal"
                      placeholder="%"
                      className="w-16 border border-neutral-300 rounded px-2 py-1"
                    />
                    <span>%</span>
                  </label>
                ) : row.percent > 0 ? (
                  <strong>{row.tierLabel}</strong>
                ) : (
                  <span className="text-neutral-500">bez slevy</span>
                )}
              </div>
              {(row.percent === null || row.percent > 0) && (
                <>
                  <span className="text-neutral-500 lg:hidden self-center">Oslovení</span>
                  <input
                    name={`salut:${row.key}`}
                    defaultValue={row.salutation}
                    placeholder="bez oslovení"
                    aria-label={`Oslovení – ${row.name}`}
                    className="w-full min-w-0 border border-neutral-300 rounded px-2 py-1"
                  />
                </>
              )}
            </div>
          ))}
        </div>
        <p className="text-sm text-neutral-600">
          Oslovení se vloží za „Dobrý den,“ (například „paní Nováková“ nebo „pane Nováku“). Prázdné pole = jen „Dobrý den,“.
        </p>
        <Message state={state} />
        <button type="submit" disabled={pending} className="self-start rounded-lg bg-begina-primary-900 text-white px-5 py-2.5 font-medium disabled:opacity-60">
          {pending ? "Ukládám…" : "Schválit vyhodnocení"}
        </button>
      </form>

      <form action={optAction} className="flex flex-col gap-2 border-t border-neutral-200 pt-4">
        <label className="text-sm font-medium" htmlFor="optout-email">
          Klient odpověděl „NE“ — už mu neposílat e-maily o partnerském programu
        </label>
        <div className="flex flex-wrap gap-2">
          <input id="optout-email" name="email" type="email" required placeholder="e-mail klienta" className="w-full sm:w-72 border border-neutral-300 rounded px-2 py-1.5 text-sm" />
          <button type="submit" disabled={optPending} className="rounded-lg border border-neutral-400 px-4 py-1.5 text-sm font-medium disabled:opacity-60">
            Odhlásit
          </button>
        </div>
        <Message state={optState} />
      </form>
    </div>
  );
}

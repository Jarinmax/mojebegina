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
  code: string | null;
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-neutral-300">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Zákazník</th>
                <th className="py-2 pr-3 text-right">Objednávek</th>
                <th className="py-2 pr-3 text-right">S dopravou</th>
                <th className="py-2 pr-3 text-right">Zboží bez dopravy</th>
                <th className="py-2 pr-3">Úroveň a kód</th>
                <th className="py-2">Oslovení v e-mailu</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key} className="border-b border-neutral-200 align-top">
                  <td className="py-2 pr-3">{index + 1}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-neutral-500">{row.emails.join(", ") || "bez e-mailu"}</div>
                    {row.optedOut && <div className="text-amber-700">odhlášen z e-mailů — kód dostane, e-mail ne</div>}
                    {row.sent && <div className="text-green-700">e-mail odeslán</div>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.orders}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{kc(row.totalKc)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium">{kc(row.goodsKc)}</td>
                  <td className="py-2 pr-3">
                    {row.percent === null ? (
                      <label className="flex items-center gap-2">
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
                      <span>
                        {row.tierLabel} · <strong>{row.code}</strong>
                      </span>
                    ) : (
                      <span className="text-neutral-500">bez slevy</span>
                    )}
                  </td>
                  <td className="py-2">
                    {(row.percent === null || row.percent > 0) && (
                      <input
                        name={`salut:${row.key}`}
                        defaultValue={row.salutation}
                        placeholder="paní Nováková"
                        className="w-44 border border-neutral-300 rounded px-2 py-1"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <div className="flex gap-2">
          <input id="optout-email" name="email" type="email" required placeholder="e-mail klienta" className="w-72 border border-neutral-300 rounded px-2 py-1.5 text-sm" />
          <button type="submit" disabled={optPending} className="rounded-lg border border-neutral-400 px-4 py-1.5 text-sm font-medium disabled:opacity-60">
            Odhlásit
          </button>
        </div>
        <Message state={optState} />
      </form>
    </div>
  );
}

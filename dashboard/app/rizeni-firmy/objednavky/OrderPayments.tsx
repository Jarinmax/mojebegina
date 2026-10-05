"use client";

// ESHOP 1.0 — platby e-shopové objednávky v MojeBegina: stav úhrady,
// seznam plateb (pokusy kartou, převody, hotovost, vratky) a „Zapsat
// platbu“. Stav Zaplaceno se nepřepíná ručně — nastaví se sám, až je
// uhrazená celá částka (lib/eshop/payments.ts).
import { useActionState, useState } from "react";
import { recordPaymentAction, type ActionState } from "./actions";
import type { OrderPaymentSummary } from "@/lib/eshop/payments";
import { formatCzechDate, formatKc } from "@/lib/format";

const initialState: ActionState = null;

const BALANCE_LABELS: Record<OrderPaymentSummary["balanceState"], string> = {
  unpaid: "Nezaplaceno",
  partially_paid: "Částečně zaplaceno",
  paid: "Zaplaceno",
  overpaid: "Přeplaceno — rozdíl vrátit",
  refunded: "Vráceno",
};

const SOURCE_LABELS: Record<string, string> = { stripe: "Stripe", bank: "Banka", manual: "Ručně" };
const METHOD_LABELS: Record<string, string> = { card: "kartou", bank_transfer: "převodem", cash: "hotově" };
const STATUS_LABELS: Record<string, string> = {
  pending: "čeká",
  succeeded: "přijato",
  failed: "neúspěšná",
  cancelled: "zrušená",
  superseded: "nahrazeno záznamem z banky",
  refunded: "vráceno",
};

/** Haléře → „379 Kč“ / „379,50 Kč“. */
function formatHal(hal: number): string {
  return hal % 100 === 0 ? formatKc(hal / 100) : `${(hal / 100).toFixed(2).replace(".", ",")} Kč`;
}

/** Haléře → hodnota do pole částky („379“ / „379,50“). */
function amountField(hal: number): string {
  return hal % 100 === 0 ? String(hal / 100) : (hal / 100).toFixed(2).replace(".", ",");
}

export default function OrderPayments({
  orderId,
  summary,
  paymentVs,
  token,
  today,
}: {
  orderId: string;
  summary: OrderPaymentSummary;
  paymentVs: string | null;
  /** jednorázový token formuláře (nový po každém uložení) */
  token: string;
  /** dnešní datum v Praze (YYYY-MM-DD) */
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = recordPaymentAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const [processedState, setProcessedState] = useState(state);
  if (state !== processedState) {
    setProcessedState(state);
    if (state && "success" in state) setOpen(false);
  }

  const paid = summary.balanceState === "paid" || summary.balanceState === "overpaid";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-neutral-500">Platby{paymentVs && <> · VS {paymentVs}</>}</p>
        <p className={`text-xs font-medium ${paid ? "text-emerald-700" : "text-amber-700"}`}>
          {BALANCE_LABELS[summary.balanceState]}
        </p>
      </div>
      <p className="text-sm text-begina-primary-900">
        Uhrazeno {formatHal(summary.netHal)} z {formatHal(summary.requiredHal)}
        {summary.remainingHal > 0 && <span className="text-neutral-500"> · zbývá {formatHal(summary.remainingHal)}</span>}
      </p>

      {summary.payments.length > 0 && (
        <ul className="flex flex-col gap-1">
          {summary.payments.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className={p.status === "succeeded" || p.status === "refunded" ? "text-neutral-700" : "text-neutral-400"}>
                {p.direction === "outflow" ? "Vratka" : "Platba"} {METHOD_LABELS[p.method] ?? p.method} ·{" "}
                {SOURCE_LABELS[p.source] ?? p.source} · {STATUS_LABELS[p.status] ?? p.status}
                {p.note && <> · {p.note}</>}
              </span>
              <span className="whitespace-nowrap text-neutral-500">
                {p.direction === "outflow" ? "−" : ""}
                {formatHal(p.amountHal)} · {formatCzechDate(p.occurredAt ?? p.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state && "success" in state && <p className="text-xs text-emerald-700">{state.success}</p>}

      {!open ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm font-medium text-begina-primary-900 hover:underline"
          >
            Zapsat platbu
          </button>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-2 border border-neutral-200 rounded-lg p-3">
          <input type="hidden" name="token" value={token} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Částka (Kč)
              <input
                name="amountKc"
                inputMode="decimal"
                required
                defaultValue={amountField(summary.remainingHal > 0 ? summary.remainingHal : summary.requiredHal)}
                className="px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Datum přijetí
              <input
                type="date"
                name="date"
                required
                max={today}
                defaultValue={today}
                className="px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Způsob
            <select
              name="method"
              defaultValue="bank_transfer"
              className="px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
            >
              <option value="bank_transfer">Převodem na účet</option>
              <option value="cash">Hotově</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Poznámka (nepovinné)
            <input
              name="note"
              maxLength={500}
              className="px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
            />
          </label>
          <p className="text-xs text-neutral-500">
            Zaplaceno se nastaví samo, až bude uhrazená celá částka. Pak zákazník dostane e-mail „Platbu jsme přijali“.
          </p>
          {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {pending ? "Ukládám…" : "Zapsat platbu"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="text-sm font-medium text-neutral-600 px-4 py-2"
            >
              Zavřít
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

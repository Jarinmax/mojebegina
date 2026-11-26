"use client";

import { useActionState, useState } from "react";
import { handoverAction, type HandoverState } from "./actions";

// Předání objednávky z výrobní karty (Lucie 26. 11. 2026): Jarin vybere,
// jak předal (přepravci / osobně) a u nezaplacené objednávky jak se platí.
// Podle toho se faktura vystaví uhrazená, nebo s QR kódem k zaplacení.

type Mode = "carrier" | "personal";
type Payment = "cash" | "card" | "prepaid" | "invoice";

const PAYMENTS: { value: Payment; title: string; hint: string }[] = [
  { value: "cash", title: "Zaplaceno hotově", hint: "Faktura odejde jako uhrazená." },
  { value: "card", title: "Zaplaceno kartou", hint: "Faktura odejde jako uhrazená." },
  { value: "prepaid", title: "Zaplaceno předem převodem / QR", hint: "Peníze už přišly — faktura odejde jako uhrazená." },
  { value: "invoice", title: "Nezaplaceno — poslat fakturu", hint: "Zákazníkovi odejde faktura s QR kódem k zaplacení." },
];

function Option({
  name,
  value,
  checked,
  onChange,
  title,
  hint,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <label
      className={`flex gap-3 items-start rounded-xl border-2 p-3 cursor-pointer ${
        checked ? "border-emerald-600 bg-emerald-50" : "border-neutral-300 bg-white"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1 w-5 h-5 accent-emerald-700" />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-begina-primary-900">{title}</span>
        {hint && <span className="block text-xs text-neutral-600">{hint}</span>}
      </span>
    </label>
  );
}

export default function HandoverPanel({
  orderId,
  needsPayment,
  defaultMode,
  shipped,
  shippedLine,
  today,
}: {
  orderId: string;
  /** ruční objednávka, ještě nezaplacená */
  needsPayment: boolean;
  defaultMode: Mode;
  shipped: boolean;
  /** „Předáno osobně 26. 11. · Jaroslav Viner“ */
  shippedLine: string | null;
  today: string;
}) {
  const [state, action, pending] = useActionState<HandoverState, FormData>(handoverAction.bind(null, orderId), null);
  // Lucie 26. 11.: nic předvybraného — Jarin musí sám zvolit přepravce, nebo osobně
  const [mode, setMode] = useState<Mode | null>(shipped ? defaultMode : null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [editing, setEditing] = useState(false);

  if (shipped && !needsPayment && !editing) {
    return (
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3">
        <p className="text-[15px] font-semibold text-begina-primary-900">✓ {shippedLine ?? "Odesláno"}</p>
        <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs underline text-neutral-600">
          Opravit způsob předání
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {shipped && shippedLine && <p className="text-sm text-begina-primary-900">✓ {shippedLine}</p>}

      <div>
        <p className="text-sm font-bold text-begina-primary-900 mb-2">1. Jak jsi to předal?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Option name="mode" value="carrier" checked={mode === "carrier"} onChange={() => setMode("carrier")} title="Předáno přepravci" hint="CoolBalík / jiný dopravce" />
          <Option name="mode" value="personal" checked={mode === "personal"} onChange={() => setMode("personal")} title="Předáno osobně" hint="Rozvoz Begina / vyzvednutí" />
        </div>
      </div>

      {needsPayment && (
        <div>
          <p className="text-sm font-bold text-begina-primary-900 mb-2">2. Jak zákazník platí?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PAYMENTS.map((p) => (
              <Option
                key={p.value}
                name="payment"
                value={p.value}
                checked={payment === p.value}
                onChange={() => setPayment(p.value)}
                title={p.title}
                hint={p.hint}
              />
            ))}
          </div>
        </div>
      )}

      {!shipped && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
          Datum předání
          <input
            type="date"
            name="shippedOn"
            defaultValue={today}
            max={today}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-[15px] text-begina-primary-900 bg-white"
          />
        </label>
      )}

      <button
        type="submit"
        disabled={pending || !mode || (needsPayment && !payment)}
        className="w-full rounded-xl bg-begina-primary-900 text-white text-base font-bold py-3 disabled:opacity-40"
      >
        {pending ? "Ukládám…" : shipped ? "Uložit" : "Potvrdit předání"}
      </button>
      {!mode ? (
        <p className="text-xs text-neutral-600 -mt-2">Nejdřív vyber, jak jsi to předal.</p>
      ) : (
        needsPayment && !payment && <p className="text-xs text-neutral-600 -mt-2">Nejdřív vyber, jak zákazník platí.</p>
      )}
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

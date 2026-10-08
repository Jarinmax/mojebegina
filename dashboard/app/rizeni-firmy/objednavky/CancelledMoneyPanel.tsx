"use client";

// Stornovaná objednávka, za kterou Begina drží peníze (lib/eshop/cancellation.ts).
// Zásada majitele: peníze NEZNAMENAJÍ automaticky vrácení — nejdřív
// kontaktovat zákazníka a nabídnout jiný produkt nebo novou objednávku;
// podle JEHO rozhodnutí platbu převést, nebo (bez zdržování) vrátit.
// Souhlas zákazníka je povinný a zapíše se do historie.
import { useActionState } from "react";
import {
  recordRefundAction,
  requestRefundAction,
  transferPaymentAction,
  type ActionState,
} from "./actions";
import FormMessage from "./FormMessage";
import type { CancelledMoney } from "@/lib/eshop/cancellation";

const initialState: ActionState = null;

const INPUT = "px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white";
const BUTTON =
  "text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap self-start";

function kc(hal: number): string {
  return `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(hal / 100)} Kč`;
}

function ConsentFields() {
  return (
    <>
      <label className="flex items-center gap-2 text-xs text-neutral-700">
        <input type="checkbox" name="consent" required />
        Zákazník s tím souhlasil
      </label>
      <input name="note" required minLength={3} maxLength={500} placeholder="Jak a kdy souhlasil (např. e-mail 9. 10.)" className={INPUT} />
    </>
  );
}

function TransferForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(transferPaymentAction.bind(null, orderId), initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 border border-neutral-200 bg-white rounded-lg p-3">
      <p className="text-sm font-medium text-begina-primary-900">Zákazník souhlasí s jiným produktem</p>
      <p className="text-xs text-neutral-500">
        Platba se převede celá na jeho e-shopovou objednávku. Rozdíl ceny: doplatek, nebo přeplatek k vrácení.
      </p>
      <input name="target" required inputMode="numeric" placeholder="Číslo nebo variabilní symbol nové objednávky" className={INPUT} />
      <ConsentFields />
      <label className="flex items-center gap-2 text-xs text-neutral-500">
        <input type="checkbox" name="differentCustomer" />
        Nová objednávka je na jiný e-mail — potvrzuji, že je to správně
      </label>
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Převádím…" : "Převést platbu"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function RequestRefundForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(requestRefundAction.bind(null, orderId), initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 border border-neutral-200 bg-white rounded-lg p-3">
      <p className="text-sm font-medium text-begina-primary-900">Zákazník požaduje vrácení peněz</p>
      <ConsentFields />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Ukládám…" : "Označit k vrácení"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function RecordRefundForm({ orderId, heldHal, today }: { orderId: string; heldHal: number; today: string }) {
  const [state, formAction, pending] = useActionState(recordRefundAction.bind(null, orderId), initialState);
  const amount = heldHal % 100 === 0 ? String(heldHal / 100) : (heldHal / 100).toFixed(2).replace(".", ",");
  return (
    <form action={formAction} className="flex flex-col gap-2 border border-neutral-200 bg-white rounded-lg p-3">
      <p className="text-sm font-medium text-begina-primary-900">Zapsat skutečné vrácení</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Vrácená částka (Kč)
          <input name="amountKc" inputMode="decimal" required defaultValue={amount} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Datum vrácení
          <input type="date" name="date" required max={today} defaultValue={today} className={INPUT} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Způsob
        <select name="method" defaultValue="bank_transfer" className={INPUT}>
          <option value="bank_transfer">Převodem z účtu</option>
          <option value="card">Na kartu (ve Stripe)</option>
          <option value="cash">Hotově</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        ID transakce vrácení (banka / Stripe / pokladna)
        <input name="txId" required minLength={3} maxLength={100} className={INPUT} />
      </label>
      <input name="note" maxLength={500} placeholder="Poznámka (nepovinné)" className={INPUT} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Ukládám…" : "Zapsat vrácení"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

export default function CancelledMoneyPanel({
  orderId,
  money,
  today,
}: {
  orderId: string;
  money: CancelledMoney;
  /** dnešní datum v Praze (YYYY-MM-DD) */
  today: string;
}) {
  if (money.stage === "refund") {
    return (
      <div className="border border-red-200 bg-red-50 rounded-xl p-4 mb-4 flex flex-col gap-2">
        <p className="text-sm font-medium text-red-800">Vrátit peníze — {kc(money.heldHal)}</p>
        <p className="text-xs text-red-800">
          Zákazník požaduje vrácení. Vraťte peníze bez zdržování (u platby kartou ve Stripe) a vrácení tu zapište.
        </p>
        <RecordRefundForm orderId={orderId} heldHal={money.heldHal} today={today} />
      </div>
    );
  }
  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 mb-4 flex flex-col gap-2">
      <p className="text-sm font-medium text-amber-900">Platba po stornu – kontaktovat zákazníka ({kc(money.heldHal)})</p>
      <p className="text-xs text-amber-900">
        Objednávka je stornovaná, ale máme zákazníkovy peníze. Kontaktujte ho a nabídněte jiný produkt nebo novou objednávku.
        Bez jeho souhlasu platbu nepřevádějte; pokud chce peníze zpět, nezdržujte ho.
      </p>
      <TransferForm orderId={orderId} />
      <RequestRefundForm orderId={orderId} />
    </div>
  );
}

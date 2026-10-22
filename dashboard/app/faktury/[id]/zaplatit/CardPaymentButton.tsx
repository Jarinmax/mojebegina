"use client";

import { useActionState, useEffect } from "react";
import { CreditCard } from "lucide-react";
import { payInvoiceByCardAction, type InvoiceCardPaymentState } from "./actions";

export default function CardPaymentButton({ invoiceId }: { invoiceId: number }) {
  const [state, action, pending] = useActionState<InvoiceCardPaymentState, FormData>(payInvoiceByCardAction, null);
  const redirectTo = state && "redirectTo" in state ? state.redirectTo : null;
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);

  return (
    <form action={action}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button
        type="submit"
        disabled={pending || Boolean(redirectTo)}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-begina-primary-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
      >
        <CreditCard className="h-4 w-4" />
        {pending || redirectTo ? "Otevírám zabezpečenou platbu…" : "Zaplatit kartou"}
      </button>
      {state && "error" in state && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

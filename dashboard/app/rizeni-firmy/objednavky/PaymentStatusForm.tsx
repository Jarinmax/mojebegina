"use client";

import { useActionState } from "react";
import { updatePaymentStatusAction, type ActionState } from "./actions";
import { PAYMENT_LABELS } from "./orderLabels";
import FormMessage from "./FormMessage";
import type { PaymentStatus } from "@/lib/data/orderValidation";

const initialState: ActionState = null;

const OPTIONS: PaymentStatus[] = ["unpaid", "invoiced", "paid"];

export default function PaymentStatusForm({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: PaymentStatus;
}) {
  const boundAction = updatePaymentStatusAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    // Stejně jako FulfillmentStatusForm: `key` = výběr vždy podle stavu v DB.
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="expectedStatus" value={currentStatus} />
      <label htmlFor="payment-status" className="text-xs text-neutral-500">
        Stav platby
      </label>
      <div className="flex items-center gap-2">
        <select
          key={currentStatus}
          id="payment-status"
          name="status"
          defaultValue={currentStatus}
          className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          {OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {PAYMENT_LABELS[opt]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? "Ukládám…" : "Uložit"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

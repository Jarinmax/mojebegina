"use client";

import { useActionState } from "react";
import { updateFulfillmentStatusAction, type ActionState } from "./actions";
import { FULFILLMENT_LABELS } from "./orderLabels";
import type { FulfillmentStatus } from "@/lib/data/orderValidation";

const initialState: ActionState = null;

const OPTIONS: FulfillmentStatus[] = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

export default function FulfillmentStatusForm({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: FulfillmentStatus;
}) {
  const boundAction = updateFulfillmentStatusAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <label htmlFor="fulfillment-status" className="text-xs text-neutral-500">
        Stav objednávky
      </label>
      <div className="flex items-center gap-2">
        <select
          id="fulfillment-status"
          name="status"
          defaultValue={currentStatus}
          className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          {OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {FULFILLMENT_LABELS[opt]}
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
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
    </form>
  );
}

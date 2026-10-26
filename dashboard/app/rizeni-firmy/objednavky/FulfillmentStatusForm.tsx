"use client";

import { useActionState } from "react";
import { updateFulfillmentStatusAction, type ActionState } from "./actions";
import { FULFILLMENT_LABELS } from "./orderLabels";
import FormMessage from "./FormMessage";
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

// Výběr ukazuje VŽDY stav z DB: <select> s defaultValue si výchozí hodnotu
// bere jen při vzniku a React 19 po odeslání formulář resetuje na ni —
// bez `key` by se po uložení vrátil stav z načtení stránky. Klíč podle
// aktuálního stavu ho po obnovení stránky vytvoří znovu s novou hodnotou.
// `expectedStatus` = z čeho uživatel vycházel (souběžná změna se odmítne).
export default function FulfillmentStatusForm({
  orderId,
  currentStatus,
  emailsCustomer = false,
}: {
  orderId: string;
  currentStatus: FulfillmentStatus;
  /** e-shopová objednávka s e-mailem — storno pošle zákazníkovi e-mail */
  emailsCustomer?: boolean;
}) {
  const boundAction = updateFulfillmentStatusAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  function confirmCancel(event: React.FormEvent<HTMLFormElement>) {
    const next = new FormData(event.currentTarget).get("status");
    if (next !== "cancelled" || currentStatus === "cancelled") return;
    const message = emailsCustomer
      ? "Stornovat objednávku? Zákazníkovi odejde e-mail o zrušení."
      : "Stornovat objednávku?";
    if (!window.confirm(message)) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={confirmCancel} className="flex flex-col gap-1">
      <input type="hidden" name="expectedStatus" value={currentStatus} />
      <label htmlFor="fulfillment-status" className="text-xs text-neutral-500">
        Stav objednávky
      </label>
      <div className="flex items-center gap-2">
        <select
          key={currentStatus}
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
      <FormMessage state={state} />
    </form>
  );
}

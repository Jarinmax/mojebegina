"use client";

// Storno — objednávka je zaplacená a čeká na vrácení peněz. Nic se nevrací
// automaticky: peníze vrátí člověk (banka / Stripe / hotově) a tady to
// potvrdí „Vrácení vyřešeno“ (záznam v historii).
import { useActionState } from "react";
import { resolveRefundAction, type ActionState } from "./actions";
import FormMessage from "./FormMessage";

const initialState: ActionState = null;

export default function RefundNotice({ orderId, amountText }: { orderId: string; amountText: string | null }) {
  const boundAction = resolveRefundAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <div className="border border-red-200 bg-red-50 rounded-xl p-4 mb-4 flex flex-col gap-2">
      <p className="text-sm font-medium text-red-800">K vyřešení: vrácení peněz{amountText ? ` (${amountText})` : ""}</p>
      <p className="text-xs text-red-800">
        Objednávka je stornovaná, ale zaplacená. Peníze se nevracejí automaticky — vraťte je zákazníkovi samostatně
        (u vystavené faktury i dobropis v iDokladu) a pak to potvrďte.
      </p>
      <form action={formAction} className="flex items-center gap-2">
        <input
          name="note"
          maxLength={500}
          placeholder="Poznámka (např. vráceno převodem 9. 10.)"
          className="flex-1 px-3 py-2 border border-red-200 rounded-lg text-sm bg-white"
        />
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? "Ukládám…" : "Vrácení vyřešeno"}
        </button>
      </form>
      <FormMessage state={state} />
    </div>
  );
}

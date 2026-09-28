"use client";

import { useActionState, useEffect } from "react";
import { payAgainAction, type PayAgainState } from "./actions";

export default function PayAgainButton({ orderId, label }: { orderId: string; label: string }) {
  const [state, formAction, pending] = useActionState<PayAgainState, FormData>(payAgainAction, null);
  const redirectTo = state && "redirectTo" in state ? state.redirectTo : null;

  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        disabled={pending || Boolean(redirectTo)}
        className="w-full sm:w-auto bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-5 py-3 disabled:opacity-60"
      >
        {pending || redirectTo ? "Otevírám platbu…" : label}
      </button>
      {state && "error" in state && (
        <p role="alert" className="text-sm text-red-700 mt-2">
          {state.error}
        </p>
      )}
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { cancelReceiptAction, type FormState } from "../../actions";

export default function CancelForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(cancelReceiptAction, null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-red-700 underline">
        Stornovat účtenku
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap gap-2 items-center">
      <input type="hidden" name="id" value={id} />
      <input name="reason" required placeholder="Důvod storna (chyba v účtu…)" className="flex-1 min-w-48 px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
      <button disabled={pending} className="rounded-full bg-red-700 text-white px-4 py-2 text-sm disabled:opacity-50">
        {pending ? "Ruším…" : "Stornovat"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-green-700">{state.success}</p>}
    </form>
  );
}

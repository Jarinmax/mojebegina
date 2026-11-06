"use client";

import { useActionState } from "react";
import { setWorkTaskDoneAction, type PraceActionState } from "../../actions";

// Práce 2.0 — dokončení z detailu: „Splněno“ (bez schválení) nebo
// „Odeslat ke kontrole“ (se schválením). U povinné fotky je tlačítko
// neaktivní bez fotky; server to kontroluje znovu.
export default function CompleteTaskButton({ taskId, requiresApproval, blockedReason }: { taskId: string; requiresApproval: boolean; blockedReason: string | null }) {
  const [state, action, pending] = useActionState<PraceActionState, FormData>(setWorkTaskDoneAction.bind(null, taskId, true), null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending || blockedReason !== null}
        className={`min-h-12 w-full rounded-lg px-4 py-3 text-base font-medium text-white disabled:opacity-50 ${requiresApproval ? "bg-slate-700" : "bg-emerald-600"}`}
      >
        {pending ? "Ukládám…" : requiresApproval ? "Odeslat ke kontrole" : "Splněno"}
      </button>
      {blockedReason && <p className="text-sm text-orange-700">{blockedReason}</p>}
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

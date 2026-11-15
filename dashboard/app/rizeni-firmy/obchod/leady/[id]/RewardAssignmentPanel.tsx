"use client";

import { useActionState, useState } from "react";
import { cancelRewardAssignmentAction, recordRewardAssignmentAction, type RewardFormState } from "./rewardActions";

type Props = {
  leadId: string;
  canRecord: boolean;
  canCancel: boolean;
  assignment: { typeLabel: string; basis: string; recordedAt: string; note: string | null; upsellProducts: string[] } | null;
  products: { id: string; name: string }[];
};

// Evidence zákazníka a typu odměňování prodejce PŘED oslovením
// (Dohoda o odměňování prodejce ze dne 14. 11. 2026, bod 4).
export default function RewardAssignmentPanel({ leadId, canRecord, canCancel, assignment, products }: Props) {
  const [recordState, recordAction, recording] = useActionState<RewardFormState, FormData>(recordRewardAssignmentAction.bind(null, leadId), null);
  const [cancelState, cancelAction, cancelling] = useActionState<RewardFormState>(cancelRewardAssignmentAction.bind(null, leadId), null);
  const [type, setType] = useState("");

  if (assignment) {
    return (
      <div className="bg-white border border-emerald-200 rounded-xl p-4 mb-4 text-sm">
        <p className="text-xs text-neutral-500 mb-1">Odměňování prodejce</p>
        <p className="font-medium text-begina-primary-900">{assignment.typeLabel}</p>
        <p className="text-xs text-neutral-500">
          Evidováno {assignment.recordedAt}
          {assignment.basis === "confirmed_at_signing" ? " · potvrzeno při podpisu dohody" : ""}
        </p>
        {assignment.upsellProducts.length > 0 && <p className="text-xs text-neutral-600">Nový produkt: {assignment.upsellProducts.join(", ")}</p>}
        {assignment.note && <p className="text-xs text-neutral-600 mt-1">{assignment.note}</p>}
        {canCancel && (
          <form action={cancelAction} className="mt-2">
            <button type="submit" disabled={cancelling} className="text-xs font-medium text-red-700 underline disabled:opacity-50">
              {cancelling ? "Ruším…" : "Zrušit evidenci"}
            </button>
            {cancelState && "error" in cancelState && <p className="text-xs text-red-700">{cancelState.error}</p>}
          </form>
        )}
      </div>
    );
  }

  if (!canRecord) return null;

  return (
    <form action={recordAction} className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-2 text-sm">
      <p className="text-xs text-neutral-500">Odměňování prodejce — evidovat PŘED oslovením (bod 4 dohody)</p>
      <select
        name="rewardType"
        value={type}
        onChange={(e) => setType(e.target.value)}
        required
        className="w-full min-h-11 px-3 border border-neutral-200 rounded-lg bg-white text-begina-primary-900"
      >
        <option value="" disabled>Vyberte typ…</option>
        <option value="new">Nový zákazník — dosud nenakoupil</option>
        <option value="renewed">Obnovený zákazník — alespoň 3 měsíce neobjednal</option>
        <option value="upsell">Aktivní zákazník — další produkt</option>
      </select>
      {type === "upsell" && (
        <fieldset className="flex flex-col gap-1 max-h-48 overflow-y-auto border border-neutral-200 rounded-lg p-2">
          <legend className="text-xs text-neutral-500 px-1">Nový produkt, který budete nabízet</legend>
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-2 min-h-8">
              <input type="checkbox" name="productIds" value={p.id} className="h-4 w-4" />
              {p.name}
            </label>
          ))}
        </fieldset>
      )}
      <input name="note" type="text" maxLength={500} placeholder="Poznámka (nepovinné)" className="w-full min-h-11 px-3 border border-neutral-200 rounded-lg" />
      {recordState && "error" in recordState && <p className="text-sm text-red-700">{recordState.error}</p>}
      <button type="submit" disabled={recording} className="self-start min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-begina-primary-50 disabled:opacity-50">
        {recording ? "Ukládám…" : "Zaevidovat"}
      </button>
    </form>
  );
}

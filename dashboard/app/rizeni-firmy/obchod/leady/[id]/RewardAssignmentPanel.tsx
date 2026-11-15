"use client";

import { useActionState, useState } from "react";
import {
  cancelRewardAssignmentAction,
  confirmRewardAssignmentAction,
  recordRewardAssignmentAction,
  type RewardFormState,
} from "./rewardActions";

type Props = {
  leadId: string;
  isManager: boolean;
  canRecord: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  assignment: { typeLabel: string; basis: string; recordedAt: string; confirmed: boolean; note: string | null; upsellProducts: string[] } | null;
  products: { id: string; name: string }[];
};

// Typ zákazníka podle Dohody o odměňování prodejce ze dne 14. 11. 2026 (bod 4).
// Sazby určuje dohoda. Jarda typ jen NAVRHNE před oslovením; počítá se až po
// potvrzení vedením. Vedení může typ zapsat rovnou (je potvrzený hned).
export default function RewardAssignmentPanel({ leadId, isManager, canRecord, canConfirm, canCancel, assignment, products }: Props) {
  const [recordState, recordAction, recording] = useActionState<RewardFormState, FormData>(recordRewardAssignmentAction.bind(null, leadId), null);
  const [confirmState, confirmAction, confirming] = useActionState<RewardFormState>(confirmRewardAssignmentAction.bind(null, leadId), null);
  const [cancelState, cancelAction, cancelling] = useActionState<RewardFormState>(cancelRewardAssignmentAction.bind(null, leadId), null);
  const [type, setType] = useState("");

  if (assignment) {
    const error = [confirmState, cancelState].find((s) => s && "error" in s) as { error: string } | undefined;
    return (
      <div className={`bg-white border rounded-xl p-4 mb-4 text-sm ${assignment.confirmed ? "border-emerald-200" : "border-amber-300"}`}>
        <p className="text-xs text-neutral-500 mb-1">Typ zákazníka podle dohody o odměňování</p>
        <p className="font-medium text-begina-primary-900">{assignment.typeLabel}</p>
        <p className={`text-xs ${assignment.confirmed ? "text-emerald-700" : "text-amber-800"}`}>
          {assignment.confirmed
            ? assignment.basis === "confirmed_at_signing"
              ? "Potvrzeno při podpisu dohody"
              : "Potvrzeno vedením"
            : `Návrh prodejce z ${assignment.recordedAt} — čeká na potvrzení vedením, zatím se nepočítá`}
        </p>
        {assignment.upsellProducts.length > 0 && <p className="text-xs text-neutral-600">Nový produkt: {assignment.upsellProducts.join(", ")}</p>}
        {assignment.note && <p className="text-xs text-neutral-600 mt-1">{assignment.note}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {canConfirm && (
            <form action={confirmAction}>
              <button type="submit" disabled={confirming} className="min-h-11 rounded-lg bg-begina-primary-900 px-4 text-sm font-medium text-begina-primary-50 disabled:opacity-50">
                {confirming ? "Potvrzuji…" : "Potvrdit"}
              </button>
            </form>
          )}
          {canCancel && (
            <form action={cancelAction}>
              <button type="submit" disabled={cancelling} className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-700 disabled:opacity-50">
                {cancelling ? "Pracuji…" : !isManager ? "Stáhnout návrh" : assignment.confirmed ? "Zrušit" : "Zamítnout"}
              </button>
            </form>
          )}
        </div>
        {error && <p className="text-xs text-red-700 mt-1">{error.error}</p>}
      </div>
    );
  }

  if (!canRecord) return null;

  return (
    <form action={recordAction} className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-2 text-sm">
      <p className="text-xs text-neutral-500">
        {isManager
          ? "Typ zákazníka podle dohody o odměňování — zápisem vedení je potvrzený."
          : "Navrhnout typ zákazníka podle dohody o odměňování — před oslovením. Odměnu určuje dohoda; počítá se až po potvrzení vedením."}
      </p>
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
          <legend className="text-xs text-neutral-500 px-1">Nový produkt, který se bude nabízet</legend>
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
        {recording ? "Ukládám…" : isManager ? "Zapsat a potvrdit" : "Odeslat návrh ke schválení"}
      </button>
    </form>
  );
}

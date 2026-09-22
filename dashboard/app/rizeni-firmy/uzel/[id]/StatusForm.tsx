"use client";

import { useActionState, useState } from "react";
import {
  updateNodeStatusAction,
  setNodeStatusAutoAction,
  type ActionState,
} from "../../node-actions";

// Security Phase 12 (Řízení firmy 2.0) — ruční nastavení stavu (přepne
// uzel do "manual" módu, viz updateNodeStatus) a návrat do automatického
// výpočtu z dětí (setNodeStatusAuto). Dvě samostatné akce/formuláře v
// jedné komponentě, protože se logicky týkají téhož ("kdo řídí stav").
const initialState: ActionState = null;

type Props = {
  nodeId: string;
  parentId: string | null;
  currentStatus: "green" | "amber" | "red";
  currentMode: "auto" | "manual";
  currentReason: string | null;
};

export default function StatusForm({
  nodeId,
  parentId,
  currentStatus,
  currentMode,
  currentReason,
}: Props) {
  const [open, setOpen] = useState(false);

  const boundUpdate = updateNodeStatusAction.bind(null, nodeId, parentId);
  const [updateState, updateFormAction, updatePending] = useActionState(
    boundUpdate,
    initialState
  );

  const boundAuto = setNodeStatusAutoAction.bind(null, nodeId, parentId);
  const [autoState, autoFormAction, autoPending] = useActionState(boundAuto, initialState);

  const [processedState, setProcessedState] = useState(updateState);
  if (updateState !== processedState) {
    setProcessedState(updateState);
    if (updateState && "success" in updateState) {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-medium text-begina-primary-900 hover:underline"
        >
          {open ? "Zrušit ruční nastavení" : "Nastavit stav ručně"}
        </button>

        {currentMode === "manual" && (
          <form action={autoFormAction}>
            <button
              type="submit"
              disabled={autoPending}
              className="text-sm font-medium text-begina-primary-900 hover:underline disabled:opacity-50"
            >
              {autoPending ? "Přepínám…" : "Vrátit na automatický výpočet"}
            </button>
          </form>
        )}
      </div>

      {autoState && "error" in autoState && (
        <p className="text-sm text-begina-accent-700">{autoState.error}</p>
      )}

      {open && (
        <form
          action={updateFormAction}
          className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3"
        >
          <div>
            <label htmlFor="status" className="text-xs text-neutral-500 mb-1 block">
              Stav
            </label>
            <select
              id="status"
              name="status"
              defaultValue={currentStatus}
              className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
            >
              <option value="green">V pořádku</option>
              <option value="amber">Pozor</option>
              <option value="red">Vyžaduje zásah</option>
            </select>
          </div>
          <div>
            <label htmlFor="reason" className="text-xs text-neutral-500 mb-1 block">
              Důvod
            </label>
            <textarea
              id="reason"
              name="reason"
              required
              rows={2}
              defaultValue={currentMode === "manual" ? (currentReason ?? "") : ""}
              className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900"
            />
          </div>

          {updateState && "error" in updateState && (
            <p className="text-sm text-begina-accent-700">{updateState.error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={updatePending}
              className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {updatePending ? "Ukládám…" : "Uložit"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={updatePending}
              className="text-sm font-medium text-neutral-600 px-4 py-2"
            >
              Zavřít
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

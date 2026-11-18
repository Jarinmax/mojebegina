"use client";

import { useActionState } from "react";
import { assignFocusOwnerAction, type ActionState } from "../actions";
import type { StaffOption } from "@/lib/data/ceoFocus";

const initialState: ActionState = null;

type Props = {
  projectId: string;
  ownerUserId: string | null;
  ownerName: string | null;
  staff: StaffOption[];
};

// Security Phase 17 (CEO přehled 1.0) — stejná oprava jako
// LeadOwnerForm.tsx (Security Phase 16.3): placeholder option NESMÍ být
// disabled, jinak ho prohlížeč při určování skutečně vybrané hodnoty
// přeskočí a spadne na prvního NEdisabled kandidáta ze seznamu, i když
// v DB je ownerUserId NULL.
export default function FocusOwnerForm({ projectId, ownerUserId, ownerName, staff }: Props) {
  const boundAction = assignFocusOwnerAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <div>
      <p className="text-xs text-neutral-500 mb-1">Kdo je na tahu</p>
      <p className="text-sm text-begina-primary-900 mb-2">{ownerName ?? "Nikdo na tahu"}</p>
      <form action={formAction} className="flex items-center gap-2">
        <select
          name="ownerUserId"
          defaultValue={ownerUserId ?? ""}
          className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="">{ownerUserId ? "Beze změny" : "Vyberte, kdo je na tahu"}</option>
          {staff.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name ?? s.email}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap"
        >
          Přiřadit
        </button>
      </form>
      {state && "error" in state && <p className="text-xs text-begina-accent-700 mt-1">{state.error}</p>}
    </div>
  );
}

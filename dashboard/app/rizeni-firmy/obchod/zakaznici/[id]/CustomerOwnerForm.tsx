"use client";

import { useActionState } from "react";
import { assignCustomerOwnerAction, setCustomerAcquiredByAction, type ActionState } from "../../actions";
import type { StaffOption } from "@/lib/data/leads";

const initialState: ActionState = null;

type Props = {
  organizationId: string;
  ownerUserId: string | null;
  ownerName: string | null;
  acquiredByUserId: string | null;
  acquiredByName: string | null;
  staff: StaffOption[];
};

export default function CustomerOwnerForm({
  organizationId,
  ownerUserId,
  ownerName,
  acquiredByUserId,
  acquiredByName,
  staff,
}: Props) {
  const boundOwner = assignCustomerOwnerAction.bind(null, organizationId);
  const [ownerState, ownerFormAction, ownerPending] = useActionState(boundOwner, initialState);

  const boundAcquired = setCustomerAcquiredByAction.bind(null, organizationId);
  const [acquiredState, acquiredFormAction, acquiredPending] = useActionState(boundAcquired, initialState);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-neutral-500 mb-1">Obchodník (teď spravuje)</p>
        <p className="text-sm text-begina-primary-900 mb-2">{ownerName ?? "Nepřiřazeno"}</p>
        <form action={ownerFormAction} className="flex items-center gap-2">
          <select
            name="ownerUserId"
            defaultValue={ownerUserId ?? ""}
            className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
          >
            {/* Security fix — viz LeadOwnerForm.tsx: disabled placeholder
                prohlížeč tiše přeskočí a reálně vybere prvního obchodníka ze
                seznamu, i když nikdo není přiřazen. */}
            <option value="">{ownerUserId ? "Beze změny" : "Neurčeno / vyberte obchodníka"}</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name ?? s.email}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={ownerPending}
            className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap"
          >
            Přiřadit
          </button>
        </form>
        {ownerState && "error" in ownerState && (
          <p className="text-xs text-begina-accent-700 mt-1">{ownerState.error}</p>
        )}
      </div>

      <div>
        <p className="text-xs text-neutral-500 mb-1">Kdo zákazníka původně získal</p>
        <p className="text-sm text-begina-primary-900 mb-2">{acquiredByName ?? "Neurčeno"}</p>
        <form action={acquiredFormAction} className="flex items-center gap-2">
          <select
            name="acquiredByUserId"
            defaultValue={acquiredByUserId ?? ""}
            className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
          >
            {/* Security fix — viz LeadOwnerForm.tsx. */}
            <option value="">{acquiredByUserId ? "Beze změny" : "Neurčeno / vyberte obchodníka"}</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name ?? s.email}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={acquiredPending}
            className="text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap hover:border-begina-primary-300"
          >
            Uložit
          </button>
        </form>
        <p className="text-xs text-neutral-400 mt-1">
          Nastavuje se jednou — jen když je akvizice prokazatelná, nikdy se nedomýšlí.
        </p>
        {acquiredState && "error" in acquiredState && (
          <p className="text-xs text-begina-accent-700 mt-1">{acquiredState.error}</p>
        )}
      </div>
    </div>
  );
}

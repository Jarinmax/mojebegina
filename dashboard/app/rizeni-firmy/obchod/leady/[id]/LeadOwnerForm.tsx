"use client";

import { useActionState } from "react";
import { assignLeadOwnerAction, setLeadAcquiredByAction, type ActionState } from "../../actions";
import type { StaffOption } from "@/lib/data/leads";

const initialState: ActionState = null;

type Props = {
  leadId: string;
  ownerUserId: string | null;
  ownerName: string | null;
  acquiredByUserId: string | null;
  acquiredByName: string | null;
  staff: StaffOption[];
};

// ownerUserId (kdo TEĎ leada spravuje) a acquiredByUserId (kdo ho PŮVODNĚ
// získal) jsou dvě nezávislé formy — schváleno explicitně, viz
// leads.ts komentář u setLeadAcquiredBy.
export default function LeadOwnerForm({
  leadId,
  ownerUserId,
  ownerName,
  acquiredByUserId,
  acquiredByName,
  staff,
}: Props) {
  const boundOwner = assignLeadOwnerAction.bind(null, leadId);
  const [ownerState, ownerFormAction, ownerPending] = useActionState(boundOwner, initialState);

  const boundAcquired = setLeadAcquiredByAction.bind(null, leadId);
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
            {/* Security fix — placeholder NESMÍ být disabled: disabled první
                option prohlížeč tiše přeskočí a reálně vybere první NEdisabled
                <option> (= první obchodník ze seznamu), i když defaultValue
                míří jinam. To způsobovalo, že prázdná hodnota (nikdo
                nepřiřazen) se v UI jevila jako "vybraný první ze seznamu" a
                nevědomý submit by to i tak uložil. */}
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
        <p className="text-xs text-neutral-500 mb-1">Kdo leada původně získal</p>
        <p className="text-sm text-begina-primary-900 mb-2">{acquiredByName ?? "Neurčeno"}</p>
        <form action={acquiredFormAction} className="flex items-center gap-2">
          <select
            name="acquiredByUserId"
            defaultValue={acquiredByUserId ?? ""}
            className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
          >
            {/* Stejná oprava jako u ownerUserId výše — acquiredBy je
                historická pravda, nikdy se nedomýšlí, takže NULL musí zůstat
                viditelně a skutečně "nevybráno", ne tiše spadnout na prvního
                člověka ze seznamu. */}
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

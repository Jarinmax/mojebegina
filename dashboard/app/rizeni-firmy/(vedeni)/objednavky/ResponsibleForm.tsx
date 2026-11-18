"use client";

import { useActionState } from "react";
import { assignResponsibleAction, unassignResponsibleAction, type ActionState } from "./actions";
import type { InternalStaffOption } from "@/lib/data/orders";
import FormMessage from "./FormMessage";

const initialState: ActionState = null;

type Props = {
  orderId: string;
  responsibleUserId: string | null;
  responsibleName: string | null;
  staff: InternalStaffOption[];
};

export default function ResponsibleForm({ orderId, responsibleUserId, responsibleName, staff }: Props) {
  const boundAssign = assignResponsibleAction.bind(null, orderId);
  const [assignState, assignFormAction, assignPending] = useActionState(boundAssign, initialState);

  const boundUnassign = unassignResponsibleAction.bind(null, orderId);
  const [unassignState, unassignFormAction, unassignPending] = useActionState(boundUnassign, initialState);

  return (
    <div>
      <p className="text-xs text-neutral-500 mb-1">Odpovědná osoba</p>
      {responsibleUserId && (
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm text-begina-primary-900">{responsibleName ?? responsibleUserId}</p>
          <form action={unassignFormAction}>
            <button
              type="submit"
              disabled={unassignPending}
              className="text-xs font-medium text-neutral-500 hover:underline disabled:opacity-50"
            >
              Odebrat
            </button>
          </form>
        </div>
      )}
      <form action={assignFormAction} className="flex items-center gap-2">
        <select
          key={responsibleUserId ?? "none"}
          name="responsibleUserId"
          defaultValue=""
          className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white"
        >
          <option value="" disabled>
            {responsibleUserId ? "Přiřadit jiné osobě…" : "Vybrat osobu…"}
          </option>
          {staff.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name ?? s.email}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={assignPending}
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-3 py-2 disabled:opacity-50 whitespace-nowrap"
        >
          {assignPending ? "Přiřazuji…" : "Přiřadit"}
        </button>
      </form>
      <div className="mt-1">
        <FormMessage state={assignState} />
        <FormMessage state={unassignState} />
      </div>
    </div>
  );
}

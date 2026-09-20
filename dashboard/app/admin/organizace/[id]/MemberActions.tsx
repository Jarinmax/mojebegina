"use client";

import { useActionState } from "react";
import {
  removeMemberAction,
  resendActivationAction,
  type ActionState,
} from "./actions";

type Props = {
  organizationId: string;
  userId: string;
  displayName: string;
};

const initialState: ActionState = null;

export default function MemberActions({ organizationId, userId, displayName }: Props) {
  const boundRemove = removeMemberAction.bind(null, organizationId, userId);
  const [removeState, removeFormAction, removePending] = useActionState(
    boundRemove,
    initialState
  );

  const boundResend = resendActivationAction.bind(null, userId);
  const [resendState, resendFormAction, resendPending] = useActionState(
    boundResend,
    initialState
  );

  return (
    <div className="flex flex-col gap-1 items-start">
      <div className="flex gap-3">
        <form
          action={resendFormAction}
          onSubmit={(event) => {
            if (!window.confirm(`Poslat znovu aktivační/resetovací odkaz uživateli ${displayName}?`)) {
              event.preventDefault();
            }
          }}
        >
          <button
            type="submit"
            disabled={resendPending}
            className="text-xs font-medium text-begina-primary-900 hover:underline disabled:opacity-50"
          >
            {resendPending ? "Odesílám…" : "Poslat znovu odkaz"}
          </button>
        </form>
        <form
          action={removeFormAction}
          onSubmit={(event) => {
            if (!window.confirm(`Opravdu odebrat přístup uživateli ${displayName} k téhle organizaci?`)) {
              event.preventDefault();
            }
          }}
        >
          <button
            type="submit"
            disabled={removePending}
            className="text-xs font-medium text-begina-accent-700 hover:underline disabled:opacity-50"
          >
            {removePending ? "Odebírám…" : "Odebrat"}
          </button>
        </form>
      </div>
      {removeState && "error" in removeState && (
        <p className="text-xs text-begina-accent-700">{removeState.error}</p>
      )}
      {resendState && "error" in resendState && (
        <p className="text-xs text-begina-accent-700">{resendState.error}</p>
      )}
      {resendState && "success" in resendState && (
        <p className="text-xs text-begina-primary-900">{resendState.success}</p>
      )}
    </div>
  );
}

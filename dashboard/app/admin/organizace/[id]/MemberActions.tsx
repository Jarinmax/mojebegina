"use client";

import { useActionState } from "react";
import {
  inviteCustomerAction,
  removeMemberAction,
  resendActivationAction,
  type ActionState,
} from "./actions";

// Security Phase 11 — akce se řídí OnboardingStatus (lib/data/admin.ts):
// "not_invited" nabízí jen "Pozvat zákazníka" (žádný zavádějící resend,
// protože ještě nic neodešlo), "pending"/"active" nabízí resend — pro
// aktivní účet jde jen o podpůrný reset hesla, ne o "znovu pozvat".
type OnboardingStatus = "not_invited" | "pending" | "active";

type Props = {
  organizationId: string;
  userId: string;
  displayName: string;
  onboardingStatus: OnboardingStatus;
};

const initialState: ActionState = null;

export default function MemberActions({
  organizationId,
  userId,
  displayName,
  onboardingStatus,
}: Props) {
  const boundRemove = removeMemberAction.bind(null, organizationId, userId);
  const [removeState, removeFormAction, removePending] = useActionState(
    boundRemove,
    initialState
  );

  const boundInvite = inviteCustomerAction.bind(null, organizationId, userId);
  const [inviteState, inviteFormAction, invitePending] = useActionState(
    boundInvite,
    initialState
  );

  const boundResend = resendActivationAction.bind(null, userId);
  const [resendState, resendFormAction, resendPending] = useActionState(
    boundResend,
    initialState
  );

  const resendLabel =
    onboardingStatus === "active" ? "Poslat odkaz pro reset hesla" : "Poslat znovu odkaz";

  return (
    <div className="flex flex-col gap-1 items-start">
      <div className="flex gap-3">
        {onboardingStatus === "not_invited" ? (
          <form
            action={inviteFormAction}
            onSubmit={(event) => {
              if (!window.confirm(`Pozvat zákazníka ${displayName}? Pošle se mu e-mail s odkazem na nastavení hesla.`)) {
                event.preventDefault();
              }
            }}
          >
            <button
              type="submit"
              disabled={invitePending}
              className="text-xs font-medium text-begina-primary-900 hover:underline disabled:opacity-50"
            >
              {invitePending ? "Odesílám…" : "Pozvat zákazníka"}
            </button>
          </form>
        ) : (
          <form
            action={resendFormAction}
            onSubmit={(event) => {
              if (!window.confirm(`Poslat odkaz na nastavení hesla uživateli ${displayName}?`)) {
                event.preventDefault();
              }
            }}
          >
            <button
              type="submit"
              disabled={resendPending}
              className="text-xs font-medium text-begina-primary-900 hover:underline disabled:opacity-50"
            >
              {resendPending ? "Odesílám…" : resendLabel}
            </button>
          </form>
        )}
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
      {inviteState && "error" in inviteState && (
        <p className="text-xs text-begina-accent-700">{inviteState.error}</p>
      )}
      {inviteState && "success" in inviteState && (
        <p className="text-xs text-begina-primary-900">{inviteState.success}</p>
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

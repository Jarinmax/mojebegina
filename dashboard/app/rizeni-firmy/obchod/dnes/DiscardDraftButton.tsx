"use client";

import { useActionState } from "react";
import { discardDraftAction, type ActionState } from "./actions";

const initialState: ActionState = null;

// Security Phase 19.1 — bezpečné zahození CELÉHO draftu (vzniklého podle
// starého/chybného výběrového pravidla). Stejný vzor jako ArchiveButton
// (app/rizeni-firmy/uzel/[id]/ArchiveButton.tsx): window.confirm v
// onSubmit, který při zrušení zavolá preventDefault a formulář se vůbec
// neodešle. Skutečnou bezpečnost (zasáhne jen pending+draft položky,
// nikdy zveřejněné/dokončené/dřív odebrané) zaručuje SQL WHERE v
// dailyCalls.ts:discardDraft, tohle je jen UI vrstva.
export default function DiscardDraftButton({ draftCount }: { draftCount: number }) {
  const [state, formAction, pending] = useActionState(discardDraftAction, initialState);

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              `Opravdu zahodit celý návrh (${draftCount} ${draftCount === 1 ? "kontakt" : draftCount < 5 ? "kontakty" : "kontaktů"})? Zveřejněné ani dokončené položky se nezmění.`
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-accent-700 border border-begina-accent-200 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Zahazuji návrh…" : "Zahodit celý návrh"}
        </button>
      </form>
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
    </div>
  );
}

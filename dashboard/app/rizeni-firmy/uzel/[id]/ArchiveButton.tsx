"use client";

import { useActionState } from "react";
import { archiveNodeAction, type ActionState } from "../../node-actions";

// Security Phase 12 (Řízení firmy 2.0) — archivace blokovaná na serveru,
// pokud má uzel nearchivované děti (viz archiveNode v companyNodes.ts) —
// chybová hláška se zobrazí, tlačítko samo nic dopředu neověřuje.
const initialState: ActionState = null;

type Props = {
  nodeId: string;
  parentId: string | null;
  title: string;
};

export default function ArchiveButton({ nodeId, parentId, title }: Props) {
  const boundArchive = archiveNodeAction.bind(null, nodeId, parentId);
  const [state, formAction, pending] = useActionState(boundArchive, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Archivovat uzel „${title}“?`)) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-begina-accent-700 hover:underline disabled:opacity-50"
      >
        {pending ? "Archivuji…" : "Archivovat uzel"}
      </button>
      {state && "error" in state && (
        <p className="text-xs text-begina-accent-700 mt-1">{state.error}</p>
      )}
    </form>
  );
}

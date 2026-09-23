"use client";

import { useActionState } from "react";
import { formatCzechDate } from "@/lib/format";
import { assignOwnerAction, type ActionState } from "../../node-actions";
import type { NodeActivityEntry } from "@/lib/data/companyNodes";

// Security Phase 12 (Řízení firmy 2.0) — sjednocená timeline (komentáře +
// systémové události) jedním chronologickým proudem, viz specifikace.
// "Potvrdit a přiřadit" u claim_offered vždy použije authorUserId TÉ
// KONKRÉTNÍ nabídky jako nového vlastníka — žádný volný výběr/text
// (schváleno explicitně, amendment 2).
const STATUS_LABELS: Record<string, string> = {
  green: "V pořádku",
  amber: "Pozor",
  red: "Vyžaduje zásah",
};

function describeEntry(entry: NodeActivityEntry): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.kind) {
    case "created":
      return "vytvořil(a) uzel";
    case "comment":
      return "";
    case "claim_offered":
      return "se nabídl(a) k převzetí";
    case "status_changed": {
      const to = String(meta.to ?? "");
      const mode = meta.mode === "auto" ? "automaticky" : "ručně";
      return `nastavil(a) stav ${mode} na „${STATUS_LABELS[to] ?? to}“`;
    }
    case "status_propagated": {
      const to = String(meta.to ?? "");
      const driverTitle = meta.driverNodeTitle ? String(meta.driverNodeTitle) : null;
      const cause = driverTitle ? ` (kvůli „${driverTitle}“)` : "";
      return `stav byl automaticky přepočítán na „${STATUS_LABELS[to] ?? to}“${cause}`;
    }
    case "owner_assigned":
      return meta.ownerUserId
        ? `přiřadil(a) odpovědnou osobu: ${String(meta.ownerName ?? meta.ownerUserId)}`
        : "odebral(a) odpovědnou osobu";
    default:
      return "";
  }
}

const initialState: ActionState = null;

function ConfirmClaimButton({ nodeId, ownerUserId }: { nodeId: string; ownerUserId: string }) {
  const boundAssign = assignOwnerAction.bind(null, nodeId, ownerUserId);
  const [state, formAction, pending] = useActionState(boundAssign, initialState);

  return (
    <form action={formAction} className="mt-1">
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-begina-primary-900 hover:underline disabled:opacity-50"
      >
        {pending ? "Přiřazuji…" : "Potvrdit a přiřadit"}
      </button>
      {state && "error" in state && (
        <p className="text-xs text-begina-accent-700 mt-0.5">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-xs text-begina-primary-900 mt-0.5">{state.success}</p>
      )}
    </form>
  );
}

type Props = {
  nodeId: string;
  activity: NodeActivityEntry[];
};

export default function ActivityTimeline({ nodeId, activity }: Props) {
  if (activity.length === 0) {
    return <p className="text-sm text-neutral-500">Zatím žádná aktivita.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {activity.map((entry) => (
        <div key={entry.id} className="border-l-2 border-neutral-200 pl-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-begina-primary-900">
              <span className="font-medium">{entry.authorName ?? "Neznámý uživatel"}</span>{" "}
              {describeEntry(entry)}
            </p>
            <p className="text-xs text-neutral-400 whitespace-nowrap">
              {formatCzechDate(entry.createdAt)}
            </p>
          </div>
          {entry.body && (
            <p className="text-sm text-neutral-600 whitespace-pre-wrap mt-0.5">{entry.body}</p>
          )}
          {entry.kind === "claim_offered" && (
            <ConfirmClaimButton nodeId={nodeId} ownerUserId={entry.authorUserId} />
          )}
        </div>
      ))}
    </div>
  );
}

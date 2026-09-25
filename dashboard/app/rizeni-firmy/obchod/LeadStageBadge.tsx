import type { LeadStage } from "@/lib/data/leadValidation";
import { STAGE_LABELS, STAGE_CLASSES } from "./leadLabels";

export default function LeadStageBadge({ stage }: { stage: LeadStage }) {
  return (
    <span
      className={`inline-flex items-center text-xs font-medium border rounded-full px-2 py-0.5 ${STAGE_CLASSES[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

export function FollowUpBadge({ overdue, dueAt }: { overdue: boolean; dueAt: Date | null }) {
  if (!dueAt) {
    return null;
  }
  const label = `${dueAt.getUTCDate()}. ${dueAt.getUTCMonth() + 1}.`;
  return (
    <span
      className={`inline-flex items-center text-xs font-medium border rounded-full px-2 py-0.5 ${
        overdue
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-neutral-50 text-neutral-600 border-neutral-200"
      }`}
    >
      {overdue ? `Po termínu · ${label}` : `Další kontakt ${label}`}
    </span>
  );
}

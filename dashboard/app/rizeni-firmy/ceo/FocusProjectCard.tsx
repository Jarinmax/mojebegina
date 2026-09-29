import Link from "next/link";
import StatusBadge, { STATUS_CARD_CLASSES } from "@/components/company-overview/StatusBadge";
import { PRIORITY_LABELS } from "./focusLabels";
import type { FocusProjectCardData } from "@/lib/data/ceoFocus";

// Security Phase 17 (CEO přehled 1.0) — karta projektu. UX princip
// schválený explicitně: během pár vteřin musí být vidět priorita, na čem
// se pracuje, kdo je na tahu, další krok a případný blocker — proto jsou
// všechna tahle pole v kartě samotné, ne až v detailu.
export default function FocusProjectCard({ project }: { project: FocusProjectCardData }) {
  return (
    <Link
      href={`/rizeni-firmy/ceo/${project.id}`}
      className={`block border rounded-xl p-4 hover:border-begina-primary-300 transition-colors ${STATUS_CARD_CLASSES[project.status]}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {project.isActiveNow && (
            <span className="inline-flex items-center text-xs font-medium bg-begina-primary-900 text-begina-primary-50 rounded-full px-2 py-0.5">
              TEĎ
            </span>
          )}
          <p className="text-sm font-medium text-begina-primary-900">{project.title}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {project.status !== "green" && project.statusReason && (
        <p className="text-sm text-red-700 mb-2">⚠ {project.statusReason}</p>
      )}

      {project.description && (
        <p className="text-sm text-neutral-600 mb-2 line-clamp-2">{project.description}</p>
      )}

      {project.nextStep && (
        <p className="text-sm text-neutral-600 mb-2">
          <span className="text-neutral-400">Další krok: </span>
          {project.nextStep}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
        <span>{PRIORITY_LABELS[project.priority]}</span>
        <span>{project.ownerName ?? "Nikdo na tahu"}</span>
      </div>
    </Link>
  );
}

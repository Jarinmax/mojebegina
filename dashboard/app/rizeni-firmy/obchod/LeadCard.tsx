import Link from "next/link";
import { formatCzechDate } from "@/lib/format";
import LeadStageBadge, { FollowUpBadge } from "./LeadStageBadge";
import { SOURCE_LABELS, VENUE_TYPE_LABELS } from "./leadLabels";
import type { LeadCardData } from "@/lib/data/leads";
import type { LeadSource, VenueType } from "@/lib/data/leadValidation";

export default function LeadCard({ lead }: { lead: LeadCardData }) {
  return (
    <Link
      href={`/rizeni-firmy/obchod/leady/${lead.id}`}
      className={`block border rounded-xl p-4 hover:border-begina-primary-300 transition-colors ${
        lead.isNew ? "bg-amber-50 border-amber-300" : "bg-white border-neutral-200"
      }`}
    >
      {lead.isNew && (
        <p className="mb-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-amber-500 px-2 py-0.5 font-semibold text-white">Nový</span>
          <span className="text-amber-900">
            přišel {formatCzechDate(lead.createdAt)} · {SOURCE_LABELS[lead.source as LeadSource] ?? lead.source} · zatím bez obchodníka
          </span>
        </p>
      )}
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-sm font-medium text-begina-primary-900">{lead.displayName}</p>
        <LeadStageBadge stage={lead.stage} />
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-500 mb-2">
        {/* Kontaktní osoba se zobrazuje zvlášť, jen když už je title (výše)
            odvozený z companyName — jinak by se stejné jméno opakovalo. */}
        {lead.companyName && lead.contactName && <span>{lead.contactName}</span>}
        {lead.contactPhone && <span>· {lead.contactPhone}</span>}
        {lead.city && <span>· {lead.city}</span>}
        {lead.venueType && <span>· {VENUE_TYPE_LABELS[lead.venueType as VenueType] ?? lead.venueType}</span>}
      </div>

      {lead.nextStepNote && <p className="text-sm text-neutral-600 mb-2 line-clamp-2">{lead.nextStepNote}</p>}

      <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
        <span>
          {lead.lastContactedAt
            ? `Poslední kontakt ${formatCzechDate(lead.lastContactedAt)}`
            : "Zatím žádný kontakt"}
        </span>
        <div className="flex items-center gap-2">
          <FollowUpBadge overdue={lead.followUpOverdue} dueAt={lead.nextFollowUpAt} />
          <span>{lead.ownerName ?? "Bez obchodníka"}</span>
        </div>
      </div>
    </Link>
  );
}

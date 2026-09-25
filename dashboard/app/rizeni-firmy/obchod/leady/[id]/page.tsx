import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeadDetail, listStaffOptions } from "@/lib/data/leads";
import { SOURCE_LABELS, VENUE_TYPE_LABELS } from "../../leadLabels";
import LeadStageBadge, { FollowUpBadge } from "../../LeadStageBadge";
import CallLogForm from "./CallLogForm";
import LeadOwnerForm from "./LeadOwnerForm";
import LeadActivityTimeline from "./LeadActivityTimeline";
import type { LeadSource, VenueType } from "@/lib/data/leadValidation";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadDetailPage(props: PageProps<"/rizeni-firmy/obchod/leady/[id]">) {
  const { id } = await props.params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const detail = await getLeadDetail(id);
  if (!detail) {
    notFound();
  }
  const { lead, activity } = detail;
  const staff = await listStaffOptions();

  return (
    <div>
      <Link href="/rizeni-firmy/obchod" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Obchod / CRM
      </Link>

      <div className="flex items-start justify-between gap-3 mt-1 mb-1">
        <h1 className="text-lg font-medium text-begina-primary-900">{lead.companyName}</h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <LeadStageBadge stage={lead.stage} />
        <FollowUpBadge overdue={lead.followUpOverdue} dueAt={lead.nextFollowUpAt} />
      </div>

      {lead.stage === "converted" && lead.convertedOrganizationId ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-sm text-emerald-800">
          Tento lead je propojený se zákazníkem.{" "}
          <Link href={`/rizeni-firmy/obchod/zakaznici/${lead.convertedOrganizationId}`} className="underline font-medium">
            Zobrazit zákazníka →
          </Link>
        </div>
      ) : (
        lead.stage !== "not_interested" && (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-begina-primary-900 mb-1">Připraven stát se zákazníkem?</p>
            <p className="text-xs text-neutral-500 mb-3">
              Napojí leada na existující organizaci, nebo založí novou — bez duplicity zákazníků ani objednávek.
            </p>
            <Link
              href={`/rizeni-firmy/obchod/leady/${lead.id}/prevest`}
              className="inline-block text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2"
            >
              Převést na zákazníka →
            </Link>
          </div>
        )
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-3">
        <div>
          <p className="text-xs text-neutral-500 mb-0.5">Kontaktní osoba</p>
          <p className="text-sm text-begina-primary-900">{lead.contactName ?? "Neuvedeno"}</p>
          {(lead.contactPhone || lead.contactEmail) && (
            <p className="text-xs text-neutral-500">
              {[lead.contactPhone, lead.contactEmail].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Město / adresa</p>
            <p className="text-sm text-begina-primary-900">
              {[lead.city, lead.address].filter(Boolean).join(", ") || "Neuvedeno"}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Typ provozu</p>
            <p className="text-sm text-begina-primary-900">
              {lead.venueType ? VENUE_TYPE_LABELS[lead.venueType as VenueType] ?? lead.venueType : "Neuvedeno"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Zdroj</p>
            <p className="text-sm text-begina-primary-900">{SOURCE_LABELS[lead.source as LeadSource] ?? lead.source}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">IČO (pomocné)</p>
            <p className="text-sm text-begina-primary-900">{lead.ico ?? "Neuvedeno"}</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <LeadOwnerForm
          leadId={lead.id}
          ownerUserId={lead.ownerUserId}
          ownerName={lead.ownerName}
          acquiredByUserId={lead.acquiredByUserId}
          acquiredByName={lead.acquiredByName}
          staff={staff}
        />
      </div>

      {lead.stage !== "converted" && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
          <CallLogForm leadId={lead.id} />
        </div>
      )}

      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Aktivita</h2>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <LeadActivityTimeline activity={activity} />
        </div>
      </div>
    </div>
  );
}

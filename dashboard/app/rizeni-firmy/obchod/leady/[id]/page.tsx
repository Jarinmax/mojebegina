import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeadDetail, listStaffOptions } from "@/lib/data/leads";
import { SOURCE_LABELS, VENUE_TYPE_LABELS } from "../../leadLabels";
import LeadStageBadge, { FollowUpBadge } from "../../LeadStageBadge";
import CallLogForm from "./CallLogForm";
import LeadOwnerForm from "./LeadOwnerForm";
import CompanyNameForm from "./CompanyNameForm";
import LeadActivityTimeline from "./LeadActivityTimeline";
import type { LeadSource, VenueType } from "@/lib/data/leadValidation";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Security Phase 16.3 — přeuspořádáno podle skutečného telefonního
// workflow (otevřít lead → zavolat → zapsat výsledek → další krok → další
// lead), ověřeného prvním reálným E2E testem na iPhonu:
//   A. Kontaktní hlavička (kdo/kde/jak zavolat) — nahoře, bez scrollování
//   B. Zápis po hovoru — hlavní pracovní blok, hned pod hlavičkou
//   C. Administrativa (doplnění firmy, owner/akvizice, převod na
//      zákazníka, zdroj/IČO) — dolů, používá se řídce
//   D. Aktivita — dole, beze změny
// Žádná funkcionalita se neodstranila, jen přeskupila.
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

  const venueTypeLabel = lead.venueType
    ? (VENUE_TYPE_LABELS[lead.venueType as VenueType] ?? lead.venueType)
    : null;
  const locationLine = [lead.city, venueTypeLabel].filter(Boolean).join(" · ");

  return (
    <div>
      <Link href="/rizeni-firmy/obchod" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Obchod / CRM
      </Link>

      {/* A. Kontaktní hlavička — vše, co Jarda potřebuje vidět dřív, než
          zvedne telefon, bez scrollování. */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mt-2 mb-4">
        <h1 className="text-lg font-medium text-begina-primary-900">{lead.displayName}</h1>
        {lead.companyName && lead.contactName && (
          <p className="text-sm text-neutral-600 mt-0.5">{lead.contactName}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-2 mb-3">
          <LeadStageBadge stage={lead.stage} />
          <FollowUpBadge overdue={lead.followUpOverdue} dueAt={lead.nextFollowUpAt} />
        </div>

        <div className="flex flex-col gap-2">
          {lead.contactPhone && (
            <a
              href={`tel:${lead.contactPhone.replace(/\s+/g, "")}`}
              className="inline-flex items-center justify-center gap-2 text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 self-start"
            >
              📞 Zavolat · {lead.contactPhone}
            </a>
          )}
          {lead.contactEmail && (
            <a
              href={`mailto:${lead.contactEmail}`}
              className="text-sm text-neutral-600 hover:text-begina-primary-900 self-start"
            >
              {lead.contactEmail}
            </a>
          )}
          {locationLine && <p className="text-xs text-neutral-500">{locationLine}</p>}
        </div>
      </div>

      {/* B. Zápis po hovoru — hlavní pracovní blok. */}
      {lead.stage !== "converted" && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
          <CallLogForm leadId={lead.id} />
        </div>
      )}

      {/* C. Administrativa — používá se řídce, proto pod hlavní prací. */}
      <div
        className={`rounded-xl p-3 mb-4 border ${
          lead.companyName ? "bg-white border-neutral-200" : "bg-amber-50 border-amber-200"
        }`}
      >
        <p className={`text-xs mb-2 ${lead.companyName ? "text-neutral-500" : "text-amber-800"}`}>
          {lead.companyName
            ? "Firma / provozovna"
            : "Firma/provozovna zatím neznámá — doplň, jakmile ji při hovoru zjistíš."}
        </p>
        <CompanyNameForm leadId={lead.id} companyName={lead.companyName} />
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
        {lead.address && (
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Adresa</p>
            <p className="text-sm text-begina-primary-900">{lead.address}</p>
          </div>
        )}
      </div>

      {/* D. Aktivita — beze změny, dole. */}
      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Aktivita</h2>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <LeadActivityTimeline activity={activity} />
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeadDetail, listLeadSourceOrders, listStaffOptions } from "@/lib/data/leads";
import { SOURCE_LABELS, VENUE_TYPE_LABELS } from "../../leadLabels";
import LeadStageBadge, { FollowUpBadge } from "../../LeadStageBadge";
import CallLogForm from "./CallLogForm";
import RewardAssignmentPanel from "./RewardAssignmentPanel";
import { getLeadRewardAssignment } from "@/lib/data/jardaRewards";
import { pragueDateLabel } from "@/lib/data/callHistoryValidation";
import LeadOwnerForm from "./LeadOwnerForm";
import CompanyDetailsForm from "./CompanyDetailsForm";
import LeadActivityTimeline from "./LeadActivityTimeline";
import type { LeadSource, VenueType } from "@/lib/data/leadValidation";
import { leadBackLink } from "@/lib/data/callHistoryValidation";
import { db } from "@/lib/db/client";
import { getLeadPurchaseHistory } from "@/lib/data/purchaseHistorySync";
import PurchaseHistoryCard from "./PurchaseHistoryCard";
import { getAuthContext } from "@/lib/data/authContext";
import { canReadSalesManual } from "@/lib/data/salesManualAuth";
import { suggestHeardFrom } from "@/lib/data/heardFrom";
import { getGoogleCalendarConnectionStatus } from "@/lib/data/googleCalendar";

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
  // Odkaz zpět tam, odkud Jarda přišel (Hovory a kontakty, Moje práce, Dnešní volání).
  const back = leadBackLink((await props.searchParams).zpet);

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const detail = await getLeadDetail(id);
  if (!detail) {
    notFound();
  }
  const { lead, activity } = detail;
  const [staff, sourceOrders, reward, purchases] = await Promise.all([listStaffOptions(), listLeadSourceOrders(lead.id), getLeadRewardAssignment(lead.id), getLeadPurchaseHistory(db, lead.id)]);

  // Komu se termín dalšího kontaktu zapíše do Google kalendáře (vlastník
  // leadu; u leadu bez vlastníka ten, kdo se dovolá = přihlášený).
  const ctx = await getAuthContext();
  const calendarUserId = lead.ownerUserId ?? ctx?.userId ?? null;
  let calendar: { ownerName: string | null; connected: boolean; isMe: boolean } | null = null;
  if (calendarUserId) {
    try {
      const status = await getGoogleCalendarConnectionStatus(calendarUserId);
      calendar = {
        ownerName: lead.ownerName,
        connected: status.connected,
        isMe: calendarUserId === ctx?.userId,
      };
    } catch {
      calendar = null;
    }
  }
  const showManual = canReadSalesManual(ctx);

  const venueTypeLabel = lead.venueType
    ? (VENUE_TYPE_LABELS[lead.venueType as VenueType] ?? lead.venueType)
    : null;
  const locationLine = [lead.city, venueTypeLabel].filter(Boolean).join(" · ");

  return (
    <div>
      <Link href={back.href} className="text-sm text-neutral-500 hover:text-begina-primary-900">
        {back.label}
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
          {showManual && (
            <Link
              href="/rizeni-firmy/obchod/manual"
              target="_blank"
              className="inline-flex items-center gap-1 self-start text-sm font-medium text-begina-primary-900 hover:underline"
            >
              📘 Manuál pro obchodníky
            </Link>
          )}
        </div>
      </div>

      {/* B. Zápis po hovoru — hlavní pracovní blok. */}
      {lead.stage !== "converted" && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
          <CallLogForm
            leadId={lead.id}
            nextFollowUpAt={lead.nextFollowUpAt}
            nextStepNote={lead.nextStepNote}
            calendarSync={lead.calendarSync}
            unowned={lead.ownerUserId === null}
            heardFrom={lead.heardFrom}
            heardFromDetail={lead.heardFromDetail}
            suggestedHeardFrom={suggestHeardFrom(lead.source)}
            calendar={calendar}
            contactPhone={lead.contactPhone}
            contactEmail={lead.contactEmail}
            salesName={ctx?.name ?? null}
          />
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
            : "Firma/provozovna zatím neznámá — doplň ji (stačí IČO nebo název, zbytek se doplní z ARES)."}
        </p>
        <CompanyDetailsForm leadId={lead.id} companyName={lead.companyName} ico={lead.ico} address={lead.address} />
      </div>

      {/* 22. 11. 2026: přiřazení obchodníka je zabalené, ať pod zápisem
          po hovoru nesvítí další tlačítka k uložení. */}
      <details className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
          <span>
            <span className="text-neutral-500">Obchodník: </span>
            <span className="font-medium text-begina-primary-900">{lead.ownerName ?? "nikdo"}</span>
          </span>
          <span className="font-medium text-begina-primary-900 underline underline-offset-2 group-open:hidden">Upravit</span>
          <span className="hidden text-neutral-500 group-open:inline">Zavřít</span>
        </summary>
        <div className="mt-3">
        <LeadOwnerForm
          leadId={lead.id}
          ownerUserId={lead.ownerUserId}
          ownerName={lead.ownerName}
          acquiredByUserId={lead.acquiredByUserId}
          acquiredByName={lead.acquiredByName}
          staff={staff}
        />
        </div>
      </details>

      {reward.visible && (
        <RewardAssignmentPanel
          leadId={lead.id}
          isManager={reward.isManager}
          canRecord={reward.canRecord}
          canConfirm={reward.canConfirm}
          canCancel={reward.canCancel}
          products={reward.products}
          assignment={
            reward.assignment
              ? {
                  typeLabel: reward.assignment.typeLabel,
                  basis: reward.assignment.basis,
                  recordedAt: pragueDateLabel(reward.assignment.recordedAt),
                  confirmed: reward.assignment.confirmedAt !== null,
                  note: reward.assignment.note,
                  upsellProducts: reward.assignment.upsellProducts,
                }
              : null
          }
        />
      )}

      {lead.stage === "converted" && !lead.convertedOrganizationId && sourceOrders.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-sm text-emerald-800">
          Zákazník/zákaznice – soukromá osoba (bez IČO). Objednávky:{" "}
          {sourceOrders.map((o) => (o.orderNumber ? `č. ${o.orderNumber}` : "bez čísla")).join(", ")}
        </div>
      )}

      {lead.stage === "converted" && lead.convertedOrganizationId ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-sm text-emerald-800">
          Tento lead je propojený se zákazníkem.{" "}
          <Link href={`/rizeni-firmy/obchod/zakaznici/${lead.convertedOrganizationId}`} className="underline font-medium">
            Zobrazit zákazníka →
          </Link>
        </div>
      ) : (
        lead.stage !== "not_interested" && (
          <Link
            href={`/rizeni-firmy/obchod/leady/${lead.id}/prevest`}
            className="mb-4 flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-begina-primary-900"
          >
            <span>Objednal/a? Převést na zákazníka</span>
            <span aria-hidden>→</span>
          </Link>
        )
      )}

      <PurchaseHistoryCard history={purchases.history} lastSync={purchases.lastSync} />

      <details className="bg-white border border-neutral-200 rounded-xl px-4 py-3 mb-4">
        <summary className="cursor-pointer text-sm text-neutral-600">Další údaje (zdroj)</summary>
        <div className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Zdroj</p>
            <p className="text-sm text-begina-primary-900">{SOURCE_LABELS[lead.source as LeadSource] ?? lead.source}</p>
          </div>
        </div>
        </div>
      </details>

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

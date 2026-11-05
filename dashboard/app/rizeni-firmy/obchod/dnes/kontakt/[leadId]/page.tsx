import Link from "next/link";
import { notFound } from "next/navigation";
import { getDailyCallContactDetail } from "@/lib/data/dailyCalls";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";
import { formatCzechDate, formatKc } from "@/lib/format";
import LeadActivityTimeline from "../../../leady/[id]/LeadActivityTimeline";
import LeadStageBadge from "../../../LeadStageBadge";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Security Phase 19.3 — rychlý přístup z karty ve frontě ("Otevřít kartu
// zákazníka / historii") na historii kontaktu + (u zákazníka) objednávek.
// Oprávnění ověřuje VÝHRADNĚ getDailyCallContactDetail (dailyCalls.ts) —
// tahle stránka žádnou vlastní kontrolu nemá a žádnou mít nesmí, aby
// existoval jen jeden zdroj pravdy o tom, kdo smí co vidět. Forbidden tu
// NENÍ obrana do hloubky pro neočekávaný stav — běžně nastane, kdykoli
// pracovník zkusí otevřít kontakt, co mu není přiřazený a sám ho
// neobvolal, proto se zobrazí jako srozumitelná česká hláška, ne pád
// stránky.
export default async function DailyCallContactPage(
  props: PageProps<"/rizeni-firmy/obchod/dnes/kontakt/[leadId]">
) {
  const { leadId } = await props.params;
  const searchParams = await props.searchParams;
  const from = Array.isArray(searchParams.from) ? searchParams.from[0] : searchParams.from;
  const backHref = from ? `/rizeni-firmy/obchod/dnes#qi-${from}` : "/rizeni-firmy/obchod/dnes";

  if (!UUID_RE.test(leadId)) {
    notFound();
  }

  let detail;
  try {
    detail = await getDailyCallContactDetail(leadId);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
      return (
        <div>
          <Link href={backHref} className="text-sm text-neutral-500 hover:text-begina-primary-900">
            ← Zpět do fronty
          </Link>
          <div className="bg-white border border-neutral-200 rounded-xl p-4 mt-3 text-sm text-begina-accent-700">
            Nemáte oprávnění zobrazit historii tohoto kontaktu — není vám přiřazený a vy jste ho sami neobvolali.
          </div>
        </div>
      );
    }
    throw error;
  }

  if (!detail) {
    notFound();
  }
  const { lead, activity, recentOrders } = detail;

  return (
    <div>
      <Link href={backHref} className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Zpět do fronty
      </Link>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mt-2 mb-4">
        <h1 className="text-lg font-medium text-begina-primary-900">{lead.displayName}</h1>
        <div className="mt-2 mb-3">
          <LeadStageBadge stage={lead.stage} />
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
            <a href={`mailto:${lead.contactEmail}`} className="text-sm text-neutral-600 hover:text-begina-primary-900 self-start">
              {lead.contactEmail}
            </a>
          )}
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Historie hovorů a poznámek</h2>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <LeadActivityTimeline activity={activity} />
        </div>
      </div>

      {recentOrders !== null && (
        <div className="mb-4">
          <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Historie objednávek</h2>
          {recentOrders.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
              Zatím žádná objednávka.
            </div>
          ) : (
            <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/rizeni-firmy/objednavky/${order.id}`}
                  className="flex items-center justify-between text-sm hover:text-begina-primary-900"
                >
                  <span className="text-neutral-600">{formatCzechDate(order.orderedAt)}</span>
                  <span className="text-neutral-500">{formatKc(order.totalKc)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isDailyCallCurator, isDailyCallWorker } from "@/lib/data/dailyCallsAuth";
import { getCallHistory } from "@/lib/data/dailyCalls";
import { CALL_RESULT_LABELS } from "../../leadLabels";
import type { CallResult } from "@/lib/data/leadValidation";
import type { CallHistoryFilter } from "@/lib/data/dailyCalls";

export const dynamic = "force-dynamic";

// Jarda – volání a provize, část 1, bod 2 — "Již volané"/"Historie volání".
// Stejná viditelnost jako samotná stránka "Dnešní volání" (viz
// requireDailyCallAccess, lib/data/dailyCallsAuth.ts) — UI kontrola tady je
// jen přesměrování, skutečnou bránu má getCallHistory v datové vrstvě.
//
// Europe/Prague datum+čas přes Intl (stejná konvence jako
// dailyCallsValidation.ts:pragueDateString) — appka neukazuje syrový UTC
// čas serveru.
const dateTimeFormatter = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague",
  day: "numeric",
  month: "numeric",
});

function formatPragueDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

const FILTERS: CallHistoryFilter[] = ["today", "yesterday", "last7days"];
const FILTER_LABELS: Record<CallHistoryFilter, string> = {
  today: "Dnes",
  yesterday: "Včera",
  last7days: "Posledních 7 dní",
};

function isFilter(value: string | undefined): value is CallHistoryFilter {
  return FILTERS.includes(value as CallHistoryFilter);
}

// Jarda – volání a provize, doplněk k části 1 — rychlé přepínače
// Dnes/Včera/Posledních 7 dní (výchozí Dnes) + stránkování. Stav je v URL
// (searchParams), stejná konvence jako view přepínač v
// app/rizeni-firmy/obchod/page.tsx — žádný nový client-side stav, funguje
// i po obnovení stránky nebo sdílení odkazu.
export default async function CallHistoryPage(props: PageProps<"/rizeni-firmy/obchod/dnes/historie">) {
  const ctx = await getAuthContext();
  if (!isDailyCallCurator(ctx) && !isDailyCallWorker(ctx)) {
    redirect("/rizeni-firmy/obchod");
  }

  const searchParams = await props.searchParams;
  const filterParam = Array.isArray(searchParams.filter) ? searchParams.filter[0] : searchParams.filter;
  const filter: CallHistoryFilter = isFilter(filterParam) ? filterParam : "today";

  const pageParam = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const parsedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const { entries, hasMore } = await getCallHistory(filter, { page });

  return (
    <div>
      <Link href="/rizeni-firmy/obchod/dnes" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Dnešní volání
      </Link>

      <div className="mt-2 mb-4">
        <h1 className="text-lg font-medium text-begina-primary-900">Historie volání</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Zaznamenané hovory v MojeBegina, od nejnovějšího — bez ohledu na to, odkud byly zapsané.
        </p>
      </div>

      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/rizeni-firmy/obchod/dnes/historie?filter=${f}`}
            className={`text-sm font-medium rounded-lg px-3 py-1.5 ${
              filter === f
                ? "bg-begina-primary-900 text-begina-primary-50"
                : "bg-white border border-neutral-200 text-neutral-600 hover:border-begina-primary-300"
            }`}
          >
            {FILTER_LABELS[f]}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          {page > 1 ? "Žádné další záznamy." : "Zatím žádný zaznamenaný hovor v tomhle období."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <Link
              key={entry.id}
              href={`/rizeni-firmy/obchod/leady/${entry.leadId}`}
              className="block bg-white border border-neutral-200 rounded-xl p-4 hover:border-begina-primary-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                <p className="text-sm font-medium text-begina-primary-900">{entry.displayName}</p>
                <p className="text-xs text-neutral-400 whitespace-nowrap">{formatPragueDateTime(entry.createdAt)}</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-500 mb-2">
                {entry.contactPhone && <span>{entry.contactPhone}</span>}
                {entry.contactPhone && entry.contactEmail && <span>·</span>}
                {entry.contactEmail && <span className="break-all">{entry.contactEmail}</span>}
              </div>

              <p className="text-sm text-begina-primary-900 mb-1">
                {entry.callResult ? CALL_RESULT_LABELS[entry.callResult as CallResult] ?? entry.callResult : "Výsledek neuveden"}
              </p>

              {entry.note && <p className="text-sm text-neutral-600 whitespace-pre-wrap mb-1">{entry.note}</p>}

              {(entry.nextStepNote || entry.nextFollowUpAt) && (
                <p className="text-xs text-neutral-500">
                  Další krok: {entry.nextStepNote ?? "—"}
                  {entry.nextFollowUpAt && ` (do ${dateFormatter.format(entry.nextFollowUpAt)})`}
                </p>
              )}

              {entry.authorName && <p className="text-xs text-neutral-400 mt-1">Zapsal(a): {entry.authorName}</p>}
            </Link>
          ))}
        </div>
      )}

      {hasMore && (
        <Link
          href={`/rizeni-firmy/obchod/dnes/historie?filter=${filter}&page=${page + 1}`}
          className="block text-center text-sm font-medium text-begina-primary-700 bg-white border border-neutral-200 rounded-xl px-4 py-2.5 mt-3"
        >
          Načíst další →
        </Link>
      )}
    </div>
  );
}

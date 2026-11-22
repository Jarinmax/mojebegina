import Link from "next/link";
import { getCockpitCounts, listLeads, listCustomers, listFreshLeads, getHeardFromSummary } from "@/lib/data/leads";
import { HEARD_FROM_SHORT, isHeardFrom } from "@/lib/data/heardFrom";
import { getAuthContext } from "@/lib/data/authContext";
import { isDailyCallCurator, isDailyCallWorker } from "@/lib/data/dailyCallsAuth";
import MetaImportButton from "./MetaImportButton";
import CockpitTiles from "./CockpitTiles";
import LeadCard from "./LeadCard";
import CustomerCard from "./CustomerCard";

// Security Phase 16 (Obchod/CRM 1.0) — prodejní kokpit. Autorizace (ADMIN
// nebo EXECUTIVE) řeší app/rizeni-firmy/layout.tsx nad touto stránkou,
// každá volaná funkce v lib/data/leads.ts si ji navíc ověřuje sama.
export const dynamic = "force-dynamic";

const VIEWS = ["moje-leady", "moji-zakaznici", "vsechny-leady", "vsichni-zakaznici"] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABELS: Record<View, string> = {
  "moje-leady": "Moje leady",
  "moji-zakaznici": "Moji zákazníci",
  "vsechny-leady": "Všechny leady",
  "vsichni-zakaznici": "Všichni zákazníci",
};

function isView(value: string | undefined): value is View {
  return VIEWS.includes(value as View);
}

export default async function ObchodPage(props: PageProps<"/rizeni-firmy/obchod">) {
  const searchParams = await props.searchParams;
  const viewParam = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view;
  const ctx = await getAuthContext();
  // 22. 11. 2026 (Lucie): kdo nemá vlastní leady (Lucie), viděl prázdnou
  // záložku „Moje leady“ a myslel si, že ostatní leady zmizely. Bez
  // vlastních leadů se proto otevře „Všechny leady“.
  let activeView: View;
  if (isView(viewParam)) {
    activeView = viewParam;
  } else {
    const mine = await listLeads("mine");
    activeView = mine.length > 0 ? "moje-leady" : "vsechny-leady";
  }
  const showDailyCallsLink = isDailyCallCurator(ctx) || isDailyCallWorker(ctx);

  const counts = await getCockpitCounts();

  const isLeadsView = activeView === "moje-leady" || activeView === "vsechny-leady";
  const leadFilter = activeView === "moje-leady" ? "mine" : "all";
  const customerFilter = activeView === "moji-zakaznici" ? "mine" : "all";

  // eslint-disable-next-line prefer-const
  let [leadCards, customerCards, newLeads, heardSummary] = await Promise.all([
    isLeadsView ? listLeads(leadFilter) : Promise.resolve(null),
    !isLeadsView ? listCustomers(customerFilter) : Promise.resolve(null),
    listFreshLeads(),
    getHeardFromSummary(),
  ]);
  // 22. 11. 2026 (Lucie): ve „Všech leadech“ rozdělení podle obchodníka,
  // ať se nemusí číst u každé karty vpravo dole, komu patří.
  const allLeadCards = leadCards;
  const ownerParam = Array.isArray(searchParams.obchodnik) ? searchParams.obchodnik[0] : searchParams.obchodnik;
  const ownerMap = new Map<string, { label: string; count: number }>();
  let unowned = 0;
  for (const l of allLeadCards ?? []) {
    if (!l.ownerUserId) {
      unowned += 1;
      continue;
    }
    const g = ownerMap.get(l.ownerUserId) ?? { label: l.ownerName ?? "Obchodník", count: 0 };
    g.count += 1;
    ownerMap.set(l.ownerUserId, g);
  }
  const ownerGroups = [
    { key: "vsichni", label: "Všichni", count: allLeadCards?.length ?? 0 },
    ...[...ownerMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, g]) => ({ key: id, label: g.label, count: g.count })),
    ...(unowned > 0 ? [{ key: "bez", label: "Bez obchodníka", count: unowned }] : []),
  ];
  const ownerFilter = ownerGroups.some((g) => g.key === ownerParam) ? (ownerParam as string) : "vsichni";
  if (activeView === "vsechny-leady" && leadCards && ownerFilter !== "vsichni") {
    leadCards = leadCards.filter((l) => (ownerFilter === "bez" ? !l.ownerUserId : l.ownerUserId === ownerFilter));
  }

  // Na záložce „Všechny leady“ jsou nové leady už nahoře v seznamu — blok by je zdvojil.
  const showNewLeadsBlock = newLeads.length > 0 && activeView !== "vsechny-leady";

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">Obchod / CRM</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Leady, zákazníci a obchodní pipeline</p>
        </div>
        <Link
          href="/rizeni-firmy/obchod/leady/novy"
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 whitespace-nowrap"
        >
          Nový lead
        </Link>
      </div>

      <div className="flex items-center gap-1 mt-3 mb-1 flex-wrap">
        {VIEWS.map((view) => (
          <Link
            key={view}
            href={`/rizeni-firmy/obchod?view=${view}`}
            className={`text-sm font-medium rounded-lg px-3 py-1.5 ${
              activeView === view
                ? "bg-begina-primary-900 text-begina-primary-50"
                : "bg-white border border-neutral-200 text-neutral-600 hover:border-begina-primary-300"
            }`}
          >
            {VIEW_LABELS[view]}
          </Link>
        ))}
      </div>

      {showDailyCallsLink && (
        <Link
          href="/rizeni-firmy/obchod/dnes"
          className="block bg-white border border-begina-primary-200 rounded-xl p-4 mt-3 text-sm font-medium text-begina-primary-900"
        >
          Dnešní volání →
        </Link>
      )}

      {isDailyCallCurator(ctx) && <MetaImportButton />}

      {showNewLeadsBlock && (
        <section className="mt-4 flex flex-col gap-2">
          <h2 className="text-sm font-medium text-begina-primary-900">
            Nové leady — zatím nikdo nevolal ({newLeads.length})
          </h2>
          <p className="text-xs text-neutral-500">
            Zůstanou tu, dokud obchodník neuloží první zápis po hovoru. Přiřazený obchodník dostal e-mail a volá on; bez obchodníka: kdo zavolá a dovolá se, tomu se kontakt přiřadí.
          </p>
          {newLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} fresh />
          ))}
        </section>
      )}

      <div className="mb-4 mt-4">
        <CockpitTiles counts={counts} />
      </div>

      <section className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-medium text-begina-primary-900">Odkud nás zákazníci znají</h2>
        {heardSummary.counts.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">Zatím nic zjištěno — vyplňuje se po každém hovoru, kdy se obchodník dovolá.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {heardSummary.counts.map((c) => (
              <li key={c.key} className="rounded-full bg-begina-primary-50 px-3 py-1 text-sm text-begina-primary-900">
                {isHeardFrom(c.key) ? HEARD_FROM_SHORT[c.key] : c.key} <strong>{c.count}</strong>
              </li>
            ))}
          </ul>
        )}
        {heardSummary.missing > 0 && (
          <p className="mt-2 text-xs text-red-700">U {heardSummary.missing} kontaktů, kterým už někdo volal, to zatím chybí.</p>
        )}
      </section>

      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">
        {VIEW_LABELS[activeView]}
        {isLeadsView && allLeadCards ? ` (${allLeadCards.length})` : customerCards ? ` (${customerCards.length})` : ""}
      </h2>
      {activeView === "vsechny-leady" && ownerGroups.length > 1 && (
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {ownerGroups.map((g) => (
            <Link
              key={g.key}
              href={`/rizeni-firmy/obchod?view=vsechny-leady${g.key === "vsichni" ? "" : `&obchodnik=${g.key}`}`}
              className={`text-sm rounded-full px-3 py-1 ${
                ownerFilter === g.key
                  ? "bg-begina-primary-900 text-begina-primary-50"
                  : "bg-white border border-neutral-200 text-neutral-700 hover:border-begina-primary-300"
              }`}
            >
              {g.label} <span className="font-semibold">{g.count}</span>
            </Link>
          ))}
        </div>
      )}
      {isLeadsView ? (
        leadCards && leadCards.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
            {leadFilter === "mine" ? "Zatím nemáš žádné aktivní leady." : "Zatím žádný aktivní lead."}
          </div>
        ) : (
          <div className="flex flex-col gap-2">{leadCards?.map((lead) => <LeadCard key={lead.id} lead={lead} />)}</div>
        )
      ) : customerCards && customerCards.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          {customerFilter === "mine" ? "Zatím nemáš žádné zákazníky." : "Zatím žádný zákazník."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {customerCards?.map((customer) => <CustomerCard key={customer.id} customer={customer} />)}
        </div>
      )}
    </div>
  );
}

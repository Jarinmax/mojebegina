import Link from "next/link";
import { getCockpitCounts, listLeads, listCustomers } from "@/lib/data/leads";
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
  const activeView: View = isView(viewParam) ? viewParam : "moje-leady";

  const counts = await getCockpitCounts();

  const isLeadsView = activeView === "moje-leady" || activeView === "vsechny-leady";
  const leadFilter = activeView === "moje-leady" ? "mine" : "all";
  const customerFilter = activeView === "moji-zakaznici" ? "mine" : "all";

  const [leadCards, customerCards] = await Promise.all([
    isLeadsView ? listLeads(leadFilter) : Promise.resolve(null),
    !isLeadsView ? listCustomers(customerFilter) : Promise.resolve(null),
  ]);

  // Security Phase 16.6 — aktuální URL téhle stránky (s aktivním pohledem)
  // se posílá do detailu jako returnTo, aby "Zpět" vědělo, kam se skutečně
  // vrátit — viz returnTo.ts.
  const returnTo = `/rizeni-firmy/obchod?view=${activeView}`;

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

      <div className="mb-4 mt-4">
        <CockpitTiles counts={counts} />
      </div>

      <div className="flex items-center gap-1 mb-3 flex-wrap">
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

      {isLeadsView ? (
        leadCards && leadCards.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
            {leadFilter === "mine" ? "Zatím nemáš žádné aktivní leady." : "Zatím žádný aktivní lead."}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {leadCards?.map((lead) => <LeadCard key={lead.id} lead={lead} returnTo={returnTo} />)}
          </div>
        )
      ) : customerCards && customerCards.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          {customerFilter === "mine" ? "Zatím nemáš žádné zákazníky." : "Zatím žádný zákazník."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {customerCards?.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} returnTo={returnTo} />
          ))}
        </div>
      )}
    </div>
  );
}

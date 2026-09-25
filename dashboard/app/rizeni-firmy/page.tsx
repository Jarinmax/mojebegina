import Link from "next/link";
import { companyOverview } from "@/lib/content/companyOverview";
import { formatCzechDate } from "@/lib/format";
import { listCompanyNotes } from "@/lib/data/companyManagement";
import { getCompanyMap } from "@/lib/data/companyNodes";
import { listOrders } from "@/lib/data/orders";
import { getCockpitCounts } from "@/lib/data/leads";
import CompanyMap from "@/components/company-overview/CompanyMap";
import CompanyAreaAccordion from "@/components/company-overview/CompanyAreaAccordion";
import FlowSteps from "@/components/company-overview/FlowSteps";
import ResponsibilityCard from "@/components/company-overview/ResponsibilityCard";
import CompanyNotesList from "@/components/company-overview/CompanyNotesList";
import CompanyStatusSummary from "@/components/company-overview/CompanyStatusSummary";
import NodeCard from "@/components/company-overview/NodeCard";
import CompanyNoteForm from "./CompanyNoteForm";
import CreateNodeForm from "./CreateNodeForm";
import OrderSummaryTiles from "./objednavky/OrderSummaryTiles";
import CrmCockpitTiles from "./obchod/CockpitTiles";

// Security Phase 8 — obsahová stránka "Řízení firmy". Autorizace (ADMIN
// nebo EXECUTIVE) řeší výhradně app/rizeni-firmy/layout.tsx nad touhle
// stránkou. NENÍ to editace organizace ani CRM — manažerská mapa firmy.
//
// Security Phase 10 (Řízení firmy 1.0) — stránka teď kromě statického
// obsahu (lib/content/companyOverview.ts) čte i první živá data
// (listCompanyNotes) — sama žádnou autorizaci nepřidává, listCompanyNotes
// si ji ověřuje sama (requireCompanyManagementContext, viz
// lib/data/companyManagement.ts), stejně jako to dělá getOrganizationDetail
// v adminovi.
//
// Security Phase 12 (Řízení firmy 2.0) — nová živá mapa (company_nodes,
// getCompanyMap) přibyla jako první sekce, NAD dosavadní statický obsah
// (lib/content/companyOverview.ts, company_notes) — ten zůstává beze
// změny, schváleno explicitně ("zachovej stávající /rizeni-firmy,
// company_notes a existující obsah").
export const dynamic = "force-dynamic";

export default async function CompanyOverviewPage() {
  const content = companyOverview;
  const notes = await listCompanyNotes();
  const companyMap = await getCompanyMap();
  const { counts: orderCounts } = await listOrders();
  const crmCounts = await getCockpitCounts();

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Řízení firmy</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Struktura, strategie a systém řízení Beginy
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          Aktualizováno: {formatCzechDate(content.lastUpdated)}
        </p>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Obchod / CRM</h2>
          <Link
            href="/rizeni-firmy/obchod"
            className="text-sm font-medium text-begina-primary-900 hover:underline"
          >
            Otevřít kokpit →
          </Link>
        </div>
        <CrmCockpitTiles counts={crmCounts} />
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Objednávky</h2>
          <Link
            href="/rizeni-firmy/objednavky"
            className="text-sm font-medium text-begina-primary-900 hover:underline"
          >
            Zobrazit vše →
          </Link>
        </div>
        <OrderSummaryTiles counts={orderCounts} />
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Živá mapa firmy</h2>
          <CreateNodeForm parentId={null} label="Přidat oblast" />
        </div>
        <CompanyStatusSummary counts={companyMap.counts} />
        {companyMap.areas.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
            Zatím žádná oblast.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {companyMap.areas.map((area) => (
              <NodeCard key={area.id} node={area} />
            ))}
          </div>
        )}
      </div>

      <CompanyMap
        mapAreas={content.mapAreas}
        mainFlow={content.mainFlow}
        mapNotes={content.mapNotes}
      />

      <div className="mb-6">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">
          Rozdělení odpovědností
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {content.responsibilities.map((owner) => (
            <ResponsibilityCard key={owner.name} owner={owner} />
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Jak Begina funguje</h2>
        <div className="flex flex-col gap-2">
          {content.areas.map((area) => (
            <CompanyAreaAccordion key={area.id} area={area} />
          ))}
        </div>
      </div>

      <section className="bg-white border border-neutral-200 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-3">AI a automatizace</h2>
        <p className="text-sm text-neutral-600 mb-3">{content.aiAutomation.principle}</p>

        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1">Rozdělení podle typu práce</p>
          <ul className="text-sm text-neutral-600 space-y-1">
            {content.aiAutomation.modelAssignments.map((m) => (
              <li key={m.area}>
                <span className="font-medium text-begina-primary-900">{m.area}:</span> {m.model}
              </li>
            ))}
          </ul>
        </div>

        {content.aiAutomation.toReview.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-neutral-500 mb-1">K dalšímu prověření</p>
            <ul className="text-sm text-neutral-600 list-disc list-inside">
              {content.aiAutomation.toReview.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1">Budoucí specializovaní agenti</p>
          <FlowSteps steps={content.aiAutomation.futureAgents} />
        </div>

        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1">Každý agent musí mít definované</p>
          <ul className="text-sm text-neutral-600 list-disc list-inside">
            {content.aiAutomation.agentRequirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>

        <p className="text-sm font-medium text-begina-primary-900 bg-begina-primary-50 border border-begina-primary-200 rounded-lg px-3 py-2">
          {content.aiAutomation.guardrail}
        </p>
      </section>

      <section className="bg-white border border-neutral-200 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Dokumentace</h2>
        <p className="text-sm font-medium text-begina-primary-900 mb-1">
          {content.documentation.principle}
        </p>
        <p className="text-sm text-neutral-600">{content.documentation.description}</p>
      </section>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-begina-primary-900">Zápisy ze schůzek</h2>
          <CompanyNoteForm />
        </div>
        <CompanyNotesList notes={notes} />
      </div>

      <section className="bg-white border border-neutral-200 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-1">
          Archiv — původní strategická schůzka
        </h2>
        <p className="text-xs text-neutral-400 mb-3">
          Historický zápis, zachovaný beze změny — ne živý seznam výše.
        </p>
        <ul className="text-sm text-neutral-600 list-disc list-inside grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mb-4">
          {content.meetingConclusions.topics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <blockquote className="border-l-4 border-begina-accent-300 pl-3 text-sm text-neutral-600">
          <p className="text-xs font-medium text-neutral-400 mb-1">
            {content.meetingConclusions.originalNote.label}
          </p>
          <p className="italic">“{content.meetingConclusions.originalNote.text}”</p>
        </blockquote>
      </section>

      <section className="bg-white border border-neutral-200 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">
          Původní rozhodnutí a úkoly
        </h2>
        <ul className="text-sm text-neutral-600 list-disc list-inside space-y-1">
          {content.originalDecisions.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

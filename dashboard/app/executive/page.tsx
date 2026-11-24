import { listOrganizations } from "@/lib/data/admin";
import { getCompanyMap } from "@/lib/data/companyNodes";
import { listOrders } from "@/lib/data/orders";
import OrganizationsTable from "@/components/organization/OrganizationsTable";
import CompanyOverviewCard from "@/components/company-overview/CompanyOverviewCard";
import WorkTasksLink from "@/components/WorkTasksLink";

// Security Phase 7 (Executive 1.0) — read-only obdoba app/admin/page.tsx.
// Žádné tlačítko "Nový zákazník", žádná mutace — listOrganizations je
// stejná funkce, kterou volá i admin, ale je gatovaná
// requireAdminOrExecutiveContext (viz lib/data/admin.ts).
export const dynamic = "force-dynamic";

export default async function ExecutiveOrganizationsPage() {
  const organizations = await listOrganizations();
  const companyMap = await getCompanyMap();
  const { counts: orderCounts } = await listOrders();

  return (
    <div>
      {/* 24. 11. 2026 (Lucie): úvod jen Řízení firmy + Moje práce; seznam organizací sbalený dole */}
      <CompanyOverviewCard
        redCount={companyMap.counts.red}
        amberCount={companyMap.counts.amber}
        newOrdersCount={orderCounts.new}
      />
      <WorkTasksLink />

      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-neutral-500">
          Technický seznam organizací ({organizations.length})
        </summary>
        <div className="mt-3">
          <OrganizationsTable organizations={organizations} basePath="/executive/organizace" />
        </div>
      </details>
    </div>
  );
}

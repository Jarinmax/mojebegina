import { listOrganizations } from "@/lib/data/admin";
import { getCompanyMap } from "@/lib/data/companyNodes";
import OrganizationsTable from "@/components/organization/OrganizationsTable";
import CompanyOverviewCard from "@/components/company-overview/CompanyOverviewCard";

// Security Phase 7 (Executive 1.0) — read-only obdoba app/admin/page.tsx.
// Žádné tlačítko "Nový zákazník", žádná mutace — listOrganizations je
// stejná funkce, kterou volá i admin, ale je gatovaná
// requireAdminOrExecutiveContext (viz lib/data/admin.ts).
export const dynamic = "force-dynamic";

export default async function ExecutiveOrganizationsPage() {
  const organizations = await listOrganizations();
  const companyMap = await getCompanyMap();

  return (
    <div>
      <CompanyOverviewCard redCount={companyMap.counts.red} amberCount={companyMap.counts.amber} />

      <div className="mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Organizace</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {organizations.length} {organizations.length === 1 ? "organizace" : "organizací"}
        </p>
      </div>

      <OrganizationsTable organizations={organizations} basePath="/executive/organizace" />
    </div>
  );
}

import Link from "next/link";
import { listOrganizations } from "@/lib/data/admin";
import { getCompanyMap } from "@/lib/data/companyNodes";
import { listOrders } from "@/lib/data/orders";
import OrganizationsTable from "@/components/organization/OrganizationsTable";
import CompanyOverviewCard from "@/components/company-overview/CompanyOverviewCard";
import WorkTasksLink from "@/components/WorkTasksLink";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
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
          <Link href="/admin/novy-zakaznik" className="mt-3 inline-block text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2">
            Nový zákazník
          </Link>
          <OrganizationsTable organizations={organizations} basePath="/admin/organizace" />
        </div>
      </details>
    </div>
  );
}

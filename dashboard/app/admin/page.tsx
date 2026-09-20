import Link from "next/link";
import { listOrganizations } from "@/lib/data/admin";
import OrganizationsTable from "@/components/organization/OrganizationsTable";
import CompanyOverviewCard from "@/components/company-overview/CompanyOverviewCard";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  const organizations = await listOrganizations();

  return (
    <div>
      <CompanyOverviewCard />

      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">Organizace</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {organizations.length} {organizations.length === 1 ? "organizace" : "organizací"}
          </p>
        </div>
        <Link
          href="/admin/novy-zakaznik"
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2"
        >
          Nový zákazník
        </Link>
      </div>

      <OrganizationsTable organizations={organizations} basePath="/admin/organizace" />
    </div>
  );
}

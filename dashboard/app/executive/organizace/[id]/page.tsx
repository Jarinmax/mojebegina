import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail } from "@/lib/data/admin";
import { formatCzechDate } from "@/lib/format";
import OrganizationSummaryView from "@/components/organization/OrganizationSummaryView";
import OrganizationMembersTable from "@/components/organization/OrganizationMembersTable";

// Security Phase 7 (Executive 1.0) — read-only obdoba
// app/admin/organizace/[id]/page.tsx. Žádný OrganizationEditForm,
// AddMemberForm ani MemberActions — jen OrganizationSummaryView a
// OrganizationMembersTable BEZ renderActions, takže se sloupec Akce vůbec
// nevykreslí. getOrganizationDetail je stejná funkce jako u admina, ale je
// gatovaná requireAdminOrExecutiveContext (viz lib/data/admin.ts).
export const dynamic = "force-dynamic";

// organizations.id je uuid — neplatný formát by jinak spadl na chybě z DB
// driveru (invalid input syntax for type uuid), ne na hezké 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ExecutiveOrganizationDetailPage(
  props: PageProps<"/executive/organizace/[id]">
) {
  const { id } = await props.params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const org = await getOrganizationDetail(id);
  if (!org) {
    notFound();
  }

  return (
    <div>
      <Link href="/executive" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Organizace
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">{org.name}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Založeno {formatCzechDate(org.createdAt)}
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-5">
        <OrganizationSummaryView
          ico={org.ico}
          registeredAddress={org.registeredAddress}
          status={org.status}
        />
      </div>

      <div>
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">
          Uživatelé ({org.members.length})
        </h2>
        <OrganizationMembersTable members={org.members} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail } from "@/lib/data/admin";
import { formatCzechDate } from "@/lib/format";
import OrganizationMembersTable from "@/components/organization/OrganizationMembersTable";
import OrganizationEditForm from "./OrganizationEditForm";
import AddMemberForm from "./AddMemberForm";
import MemberActions from "./MemberActions";

export const dynamic = "force-dynamic";

// organizations.id je uuid — neplatný formát by jinak spadl na chybě z DB
// driveru (invalid input syntax for type uuid), ne na hezké 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminOrganizationDetailPage(
  props: PageProps<"/admin/organizace/[id]">
) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const org = await getOrganizationDetail(id);
  if (!org) {
    notFound();
  }

  const justCreated = searchParams?.vytvoreno === "1";

  return (
    <div>
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Organizace
      </Link>

      {justCreated && (
        <div className="mt-3 rounded-xl border p-3 text-sm bg-begina-primary-50 border-begina-primary-200 text-begina-primary-900">
          Organizace je založena. Doplňte historii a zkontrolujte údaje — až budete připraveni,
          pozvěte kontaktní osobu tlačítkem „Pozvat zákazníka“ u jejího jména.
        </div>
      )}

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">{org.name}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Založeno {formatCzechDate(org.createdAt)}
        </p>
      </div>

      <OrganizationEditForm
        organizationId={org.id}
        name={org.name}
        ico={org.ico}
        registeredAddress={org.registeredAddress}
        status={org.status}
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-begina-primary-900">
            Uživatelé ({org.members.length})
          </h2>
          <AddMemberForm organizationId={org.id} />
        </div>
        <OrganizationMembersTable
          members={org.members}
          renderActions={(member) => (
            <MemberActions
              organizationId={org.id}
              userId={member.userId}
              displayName={member.name ?? member.email ?? member.userId}
              onboardingStatus={member.onboardingStatus}
            />
          )}
        />
      </div>
    </div>
  );
}

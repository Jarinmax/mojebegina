import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail, getOrganizationPurchaseHistory } from "@/lib/data/admin";
import { formatCzechDate, formatKc } from "@/lib/format";
import OrganizationMembersTable from "@/components/organization/OrganizationMembersTable";
import OrganizationEditForm from "./OrganizationEditForm";
import AddMemberForm from "./AddMemberForm";
import MemberActions from "./MemberActions";
import CustomerPreviewButton from "@/components/customer-portal/CustomerPreviewButton";
import OrderCard from "@/components/OrderCard";
import AddLocationForm from "./AddLocationForm";
import OrganizationLocations from "@/components/organization/OrganizationLocations";

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
  const purchaseHistory = await getOrganizationPurchaseHistory(id);

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

      <div className="mt-3 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">{org.name}</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Založeno {formatCzechDate(org.createdAt)}
          </p>
        </div>
        <CustomerPreviewButton organizationId={org.id} origin="admin" />
      </div>

      <OrganizationEditForm
        organizationId={org.id}
        name={org.name}
        ico={org.ico}
        registeredAddress={org.registeredAddress}
        status={org.status}
      />

      <section className="mb-6" aria-labelledby="locations-title">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <h2 id="locations-title" className="text-sm font-medium text-begina-primary-900">
              Provozovny ({org.locations.length})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Dodací místa oddělená od fakturační adresy firmy
            </p>
          </div>
          <AddLocationForm organizationId={org.id} />
        </div>
        <OrganizationLocations locations={org.locations} />
      </section>

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

      <section className="mt-7" aria-labelledby="purchase-history-title">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h2 id="purchase-history-title" className="text-sm font-medium text-begina-primary-900">
              Historie nákupů ({purchaseHistory.length})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">Kompletní přehled faktur z iDokladu</p>
          </div>
          {purchaseHistory.length > 0 && (
            <p className="text-sm font-medium text-begina-primary-900">
              Celkem {formatKc(purchaseHistory.reduce((sum, order) => sum + order.totalKc, 0))}
            </p>
          )}
        </div>
        {purchaseHistory.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
            Pro tuto organizaci zatím nejsou dostupné žádné faktury.
          </div>
        ) : (
          <div className="max-w-[520px]">
            {purchaseHistory.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

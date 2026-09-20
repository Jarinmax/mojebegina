import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail } from "@/lib/data/admin";
import { formatCzechDate } from "@/lib/format";
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
  const emailFailed = justCreated && searchParams?.email === "0";

  return (
    <div>
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Organizace
      </Link>

      {justCreated && (
        <div
          className={`mt-3 rounded-xl border p-3 text-sm ${
            emailFailed
              ? "bg-begina-accent-50 border-begina-accent-200 text-begina-accent-900"
              : "bg-begina-primary-50 border-begina-primary-200 text-begina-primary-900"
          }`}
        >
          {emailFailed
            ? "Organizace i uživatel byli založeni, ale aktivační e-mail se nepodařilo odeslat. Zkuste ho poslat znovu."
            : "Organizace je založena a kontaktní osobě byl odeslán e-mail s odkazem na nastavení hesla."}
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
        {org.members.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
            Organizace zatím nemá žádného uživatele.
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3 font-medium">Jméno</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Členem od</th>
                  <th className="px-4 py-3 font-medium">Akce</th>
                </tr>
              </thead>
              <tbody>
                {org.members.map((member) => (
                  <tr key={member.userId} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 text-begina-primary-900">
                      {member.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {member.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-begina-primary-900">
                      {member.role === "owner" ? "Vlastník" : "Člen"}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {formatCzechDate(member.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <MemberActions
                        organizationId={org.id}
                        userId={member.userId}
                        displayName={member.name ?? member.email ?? member.userId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

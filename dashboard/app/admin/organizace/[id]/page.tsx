import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail } from "@/lib/data/admin";
import { formatCzechDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// organizations.id je uuid — neplatný formát by jinak spadl na chybě z DB
// driveru (invalid input syntax for type uuid), ne na hezké 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminOrganizationDetailPage(
  props: PageProps<"/admin/organizace/[id]">
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
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Organizace
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">{org.name}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">IČO {org.ico}</p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-5">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-neutral-500 mb-0.5">Sídlo</dt>
            <dd className="text-begina-primary-900">{org.registeredAddress}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 mb-0.5">Status</dt>
            <dd className="text-begina-primary-900">{org.status ?? "Neuvedeno"}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 mb-0.5">Založeno</dt>
            <dd className="text-begina-primary-900">{formatCzechDate(org.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">
          Uživatelé ({org.members.length})
        </h2>
        {org.members.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
            Organizace zatím nemá žádného uživatele.
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3 font-medium">User ID</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Členem od</th>
                </tr>
              </thead>
              <tbody>
                {org.members.map((member) => (
                  <tr key={member.userId} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 text-neutral-600 font-mono text-xs">
                      {member.userId}
                    </td>
                    <td className="px-4 py-3 text-begina-primary-900">
                      {member.role === "owner" ? "Vlastník" : "Člen"}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {formatCzechDate(member.createdAt)}
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

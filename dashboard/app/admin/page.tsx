import Link from "next/link";
import { listOrganizations } from "@/lib/data/admin";
import { formatCzechDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  const organizations = await listOrganizations();

  return (
    <div>
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

      {organizations.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          Zatím žádná organizace.
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3 font-medium">Název</th>
                <th className="px-4 py-3 font-medium">IČO</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Založeno</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/organizace/${org.id}`}
                      className="font-medium text-begina-primary-900 hover:underline"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{org.ico}</td>
                  <td className="px-4 py-3">
                    {org.status ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-begina-accent-100 text-begina-accent-900">
                        {org.status}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{formatCzechDate(org.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

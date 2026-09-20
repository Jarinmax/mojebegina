import Link from "next/link";
import { formatCzechDate } from "@/lib/format";

// Security Phase 7 (Executive 1.0) — čistě prezentační tabulka organizací,
// vytažená z app/admin/page.tsx, aby ji mohl beze změny použít i
// app/executive/page.tsx. Žádná autorizace ani data fetch — o to se stará
// volající stránka (listOrganizations už za sebou má
// requireAdminOrExecutiveContext).
type OrganizationRow = {
  id: string;
  name: string;
  ico: string;
  status: string | null;
  createdAt: Date;
};

type Props = {
  organizations: OrganizationRow[];
  basePath: string;
};

export default function OrganizationsTable({ organizations, basePath }: Props) {
  if (organizations.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
        Zatím žádná organizace.
      </div>
    );
  }

  return (
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
                  href={`${basePath}/${org.id}`}
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
  );
}

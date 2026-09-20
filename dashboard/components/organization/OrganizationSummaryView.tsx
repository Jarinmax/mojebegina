import type { ReactNode } from "react";

// Security Phase 7 (Executive 1.0) — čistě prezentační zobrazení základních
// údajů organizace (IČO/status/sídlo), vytažené z OrganizationEditForm.tsx.
// `editAction` je volitelný slot pro tlačítko "Upravit" — app/executive/...
// ho nepředává, takže z UI nejde nic upravit, ani omylem.
type Props = {
  ico: string;
  registeredAddress: string;
  status: string | null;
  editAction?: ReactNode;
};

export default function OrganizationSummaryView({
  ico,
  registeredAddress,
  status,
  editAction,
}: Props) {
  return (
    <div className="flex items-start justify-between">
      <dl className="grid grid-cols-2 gap-4 text-sm flex-1">
        <div>
          <dt className="text-xs text-neutral-500 mb-0.5">IČO</dt>
          <dd className="text-begina-primary-900">{ico}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 mb-0.5">Status</dt>
          <dd className="text-begina-primary-900">{status ?? "Neuvedeno"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-neutral-500 mb-0.5">Sídlo</dt>
          <dd className="text-begina-primary-900">{registeredAddress}</dd>
        </div>
      </dl>
      {editAction}
    </div>
  );
}

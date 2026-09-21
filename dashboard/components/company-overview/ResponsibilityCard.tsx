import type { ResponsibilityOwner } from "@/lib/content/companyOverview";

// Security Phase 10 (Řízení firmy 1.0) — čistě prezentační karta jedné
// odpovědné osoby. Stejný vzor jako ostatní komponenty v této složce.
type Props = {
  owner: ResponsibilityOwner;
};

export default function ResponsibilityCard({ owner }: Props) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <p className="text-sm font-medium text-begina-primary-900">{owner.name}</p>
      <p className="text-xs text-neutral-500 mb-3">{owner.role}</p>
      <ul className="text-sm text-neutral-600 list-disc list-inside space-y-0.5">
        {owner.areas.map((area) => (
          <li key={area}>{area}</li>
        ))}
      </ul>
    </div>
  );
}

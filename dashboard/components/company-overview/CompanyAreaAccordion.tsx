import type { CompanyAreaSection } from "@/lib/content/companyOverview";
import FlowSteps from "./FlowSteps";

// Security Phase 8 — rozbalovací karta jedné oblasti ("Jak Begina
// funguje"). Nativní <details>/<summary> — rozbalování funguje bez
// jakéhokoli klientského JS, žádná "use client" komponenta není potřeba.
type Props = {
  area: CompanyAreaSection;
};

export default function CompanyAreaAccordion({ area }: Props) {
  return (
    <details className="group bg-white border border-neutral-200 rounded-xl p-4">
      <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-begina-primary-900">
        {area.title}
        <span className="text-xs text-neutral-400 group-open:hidden">Zobrazit</span>
        <span className="hidden text-xs text-neutral-400 group-open:inline">Skrýt</span>
      </summary>

      <div className="mt-3 flex flex-col gap-3 text-sm text-neutral-600">
        <p>{area.intro}</p>

        {area.flow && (
          <div>
            {area.flowLabel && <p className="text-xs text-neutral-500 mb-1">{area.flowLabel}</p>}
            <FlowSteps steps={area.flow} />
          </div>
        )}

        {area.bullets && (
          <div>
            {area.bulletsLabel && (
              <p className="text-xs text-neutral-500 mb-1">{area.bulletsLabel}</p>
            )}
            <ul className="list-disc list-inside space-y-0.5">
              {area.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        )}

        {area.principle && (
          <p className="text-sm font-medium text-begina-primary-900 bg-begina-primary-50 border border-begina-primary-200 rounded-lg px-3 py-2">
            {area.principle}
          </p>
        )}
      </div>
    </details>
  );
}

import type { ResponsibilityOwner } from "@/lib/content/companyOverview";
import ResponsibilityCard from "./ResponsibilityCard";

// Řízení firmy — Rozdělení odpovědností: první řada vedení (CEO, CFO, COO),
// pod ní oddělená druhá řada týmu ve stejném stylu karet. Na mobilu jedna
// karta pod druhou ve stejném pořadí (nejdřív vedení, pak tým).
const GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2";

export default function ResponsibilitiesSection({
  leadership,
  team,
}: {
  leadership: ResponsibilityOwner[];
  team: ResponsibilityOwner[];
}) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Rozdělení odpovědností</h2>
      <div className={GRID}>
        {leadership.map((owner) => (
          <ResponsibilityCard key={owner.name} owner={owner} />
        ))}
      </div>
      {team.length > 0 && (
        <section aria-labelledby="responsibilities-team" className="mt-4 pt-4 border-t border-neutral-200">
          <h3 id="responsibilities-team" className="text-xs font-medium text-neutral-500 mb-2">
            Tým
          </h3>
          <div className={GRID}>
            {team.map((owner) => (
              <ResponsibilityCard key={owner.name} owner={owner} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

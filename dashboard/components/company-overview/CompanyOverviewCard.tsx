import Link from "next/link";
import { StatusCountBadge } from "./StatusBadge";

// Security Phase 8 — vstupní karta na dashboard ADMIN i EXECUTIVE, oba
// odkazují na stejnou /rizeni-firmy. Jediná komponenta, žádná duplikace
// mezi app/admin/page.tsx a app/executive/page.tsx.
//
// Fáze 12.1 — periferní stavový signál (kolik ROOT oblastí je red/amber),
// aby bylo z nadřazeného dashboardu vidět, že Řízení firmy potřebuje
// pozornost, bez nutnosti tam klikat. Počty počítá volající stránka přes
// getCompanyMap().counts (root-only, stejná logika jako Živá mapa firmy) —
// tahle komponenta jen zobrazuje, nepočítá.
type Props = {
  redCount?: number;
  amberCount?: number;
};

export default function CompanyOverviewCard({ redCount = 0, amberCount = 0 }: Props) {
  const hasAlerts = redCount > 0 || amberCount > 0;

  return (
    <Link
      href="/rizeni-firmy"
      className="flex items-center justify-between gap-3 bg-white border border-neutral-200 rounded-xl p-4 mb-5 hover:border-begina-primary-300 transition-colors"
    >
      <div>
        <h2 className="text-sm font-medium text-begina-primary-900">Řízení firmy</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Struktura, strategie a systém řízení Beginy
        </p>
      </div>
      {hasAlerts && (
        <div className="flex items-center gap-1.5 shrink-0">
          {redCount > 0 && <StatusCountBadge status="red" count={redCount} />}
          {amberCount > 0 && <StatusCountBadge status="amber" count={amberCount} />}
        </div>
      )}
    </Link>
  );
}

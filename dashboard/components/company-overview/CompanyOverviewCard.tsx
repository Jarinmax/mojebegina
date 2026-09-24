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
//
// Fáze 15.1 — obdélníkové (ne kolečkové) upozornění na nové objednávky,
// odděleně od StatusCountBadge (ten je pro Živou mapu firmy, ne
// objednávky). Prokliká přímo na /rizeni-firmy/objednavky?filter=new, proto
// karta musí přestat být jeden velký <Link> — vnořené <a> nejdou.
type Props = {
  redCount?: number;
  amberCount?: number;
  newOrdersCount?: number;
};

function newOrdersLabel(count: number): string {
  if (count === 1) return "1 nová objednávka";
  if (count >= 2 && count <= 4) return `${count} nové objednávky`;
  return `${count} nových objednávek`;
}

export default function CompanyOverviewCard({
  redCount = 0,
  amberCount = 0,
  newOrdersCount = 0,
}: Props) {
  const hasAlerts = redCount > 0 || amberCount > 0;
  const hasNewOrders = newOrdersCount > 0;

  return (
    <div className="flex items-center justify-between gap-3 bg-white border border-neutral-200 rounded-xl p-4 mb-5">
      <Link
        href="/rizeni-firmy"
        className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
      >
        <h2 className="text-sm font-medium text-begina-primary-900">Řízení firmy</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Struktura, strategie a systém řízení Beginy
        </p>
      </Link>
      {(hasNewOrders || hasAlerts) && (
        <div className="flex items-center gap-1.5 shrink-0">
          {hasNewOrders && (
            <Link
              href="/rizeni-firmy/objednavky?filter=new"
              className="text-xs font-medium border border-red-200 bg-red-50 text-red-700 rounded-lg px-2.5 py-1 hover:bg-red-100 transition-colors"
            >
              {newOrdersLabel(newOrdersCount)}
            </Link>
          )}
          {redCount > 0 && <StatusCountBadge status="red" count={redCount} />}
          {amberCount > 0 && <StatusCountBadge status="amber" count={amberCount} />}
        </div>
      )}
    </div>
  );
}

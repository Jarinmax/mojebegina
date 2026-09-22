// Security Phase 12 (Řízení firmy 2.0) — souhrnný řádek počtu Oblastí
// podle stavu, nad mřížkou karet na /rizeni-firmy.
type Props = {
  counts: { green: number; amber: number; red: number };
};

export default function CompanyStatusSummary({ counts }: Props) {
  const total = counts.green + counts.amber + counts.red;

  if (total === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 text-sm text-neutral-600 mb-3">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {counts.green} v pořádku
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        {counts.amber} pozor
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        {counts.red} vyžaduje zásah
      </span>
    </div>
  );
}

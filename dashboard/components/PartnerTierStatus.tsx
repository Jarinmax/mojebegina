import { formatKc } from "@/lib/format";
import type { PartnerTier } from "@/mock/partnerProgram";

type PartnerTierStatusProps = {
  monthlyPurchase: number;
  tiers: PartnerTier[];
};

export default function PartnerTierStatus({
  monthlyPurchase,
  tiers,
}: PartnerTierStatusProps) {
  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
  const currentIndex = sorted.reduce(
    (acc, tier, i) => (monthlyPurchase >= tier.minAmount ? i : acc),
    0
  );
  const currentTier = sorted[currentIndex];
  const nextTier = sorted[currentIndex + 1] ?? null;

  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.round(
          ((monthlyPurchase - currentTier.minAmount) /
            (nextTier.minAmount - currentTier.minAmount)) *
            100
        )
      )
    : 100;

  const remaining = nextTier ? nextTier.minAmount - monthlyPurchase : 0;

  return (
    <div className="rounded-2xl p-4 mb-4 bg-begina-primary-800 text-begina-primary-50">
      <p className="text-xs mb-1 opacity-80">Tento měsíc jste nakoupili</p>
      <div className="flex items-end justify-between mb-3">
        <p className="text-xl font-medium">{formatKc(monthlyPurchase)}</p>
        <span className="text-xs font-medium bg-begina-accent-100 text-begina-accent-900 rounded-full px-2.5 py-1">
          {currentTier.discountLabel}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-white/15 mb-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-begina-accent-100"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <p className="text-xs opacity-80">
        {nextTier
          ? `Do slevy ${nextTier.discountPercent} % chybí ${formatKc(remaining)}`
          : "Nejvyšší standardní úroveň — další růst řešíme individuální dohodou."}
      </p>
    </div>
  );
}

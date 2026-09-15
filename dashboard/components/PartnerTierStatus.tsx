import { formatKc } from "@/lib/format";
import { getPartnerTierStatus } from "@/lib/partnerTier";
import type { PartnerTier } from "@/mock/partnerProgram";

type PartnerTierStatusProps = {
  monthlyPurchase: number;
  tiers: PartnerTier[];
};

export default function PartnerTierStatus({
  monthlyPurchase,
  tiers,
}: PartnerTierStatusProps) {
  const { currentTier, nextTier, remaining, progressPercent } =
    getPartnerTierStatus(monthlyPurchase, tiers);

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

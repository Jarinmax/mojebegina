import type { PartnerTier } from "@/mock/partnerProgram";

export type PartnerTierStatus = {
  currentTier: PartnerTier;
  nextTier: PartnerTier | null;
  remaining: number;
  progressPercent: number;
};

export function getPartnerTierStatus(
  monthlyPurchase: number,
  tiers: PartnerTier[]
): PartnerTierStatus {
  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
  const currentIndex = sorted.reduce(
    (acc, tier, i) => (monthlyPurchase >= tier.minAmount ? i : acc),
    0
  );
  const currentTier = sorted[currentIndex];
  const nextTier = sorted[currentIndex + 1] ?? null;

  const remaining = nextTier ? nextTier.minAmount - monthlyPurchase : 0;
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

  return { currentTier, nextTier, remaining, progressPercent };
}

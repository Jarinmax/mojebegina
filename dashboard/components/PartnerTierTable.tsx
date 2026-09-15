import type { PartnerTier } from "@/mock/partnerProgram";

type PartnerTierTableProps = {
  tiers: PartnerTier[];
  currentTierId: number;
};

export default function PartnerTierTable({
  tiers,
  currentTierId,
}: PartnerTierTableProps) {
  return (
    <div className="mb-4">
      <p className="text-sm text-neutral-500 mb-2">Partnerské úrovně</p>
      <div className="flex flex-col gap-2">
        {tiers.map((tier) => {
          const isCurrent = tier.id === currentTierId;
          return (
            <div
              key={tier.id}
              className={`flex items-center justify-between rounded-xl px-3.5 py-3 ${
                isCurrent
                  ? "bg-begina-primary-50 border border-begina-primary-700"
                  : "bg-white border border-neutral-200"
              }`}
            >
              <span className="text-sm">{tier.rangeLabel}</span>
              <span
                className={`text-sm font-medium ${
                  isCurrent ? "text-begina-primary-800" : "text-neutral-600"
                }`}
              >
                {tier.discountLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

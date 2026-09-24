import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatKc } from "@/lib/format";
import { getPartnerTierStatus } from "@/lib/partnerTier";
import type { PartnerTier } from "@/mock/partnerProgram";

type PartnerProgramSummaryProps = {
  monthlyPurchase: number;
  tiers: PartnerTier[];
  href: string;
};

export default function PartnerProgramSummary({
  monthlyPurchase,
  tiers,
  href,
}: PartnerProgramSummaryProps) {
  const { currentTier, nextTier, remaining } = getPartnerTierStatus(
    monthlyPurchase,
    tiers
  );

  return (
    <Link
      href={href}
      className="block rounded-2xl p-4 mb-4 bg-begina-primary-50 border border-begina-primary-700"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mb-2.5">
        <p className="text-sm font-medium text-begina-primary-900 min-w-0 break-words">
          Partnerský program
        </p>
        <span className="text-xs font-medium bg-begina-accent-700 text-white rounded-full px-2.5 py-1 shrink-0">
          {currentTier.discountLabel}
        </span>
      </div>

      <p className="text-sm text-begina-primary-800 mb-0.5 break-words">
        Tento měsíc: {formatKc(monthlyPurchase)}
      </p>
      <p className="text-sm text-begina-primary-800 mb-3 break-words">
        {nextTier
          ? `Do úrovně ${nextTier.discountPercent} % chybí ${formatKc(remaining)}`
          : "Nejvyšší standardní úroveň dosažena"}
      </p>

      <span className="text-sm font-medium text-begina-primary-900 inline-flex items-center gap-1">
        Zobrazit program
        <ArrowRight className="w-4 h-4" />
      </span>
    </Link>
  );
}

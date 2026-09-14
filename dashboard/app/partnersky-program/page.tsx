import PageHeader from "@/components/PageHeader";
import PartnerProgramIntro from "@/components/PartnerProgramIntro";
import PartnerTierStatus from "@/components/PartnerTierStatus";
import PartnerTierTable from "@/components/PartnerTierTable";
import PartnerProgramInfo from "@/components/PartnerProgramInfo";
import BottomNav from "@/components/BottomNav";
import { bottomNavItems } from "@/mock/customer";
import {
  partnerTiers,
  partnerProgramConditions,
  partnerProgramShipping,
  partnerProgramLegalNote,
  mockMonthlyPurchase,
} from "@/mock/partnerProgram";

const sortedTiers = [...partnerTiers].sort((a, b) => a.minAmount - b.minAmount);
const currentTier = sortedTiers.reduce(
  (acc, tier) => (mockMonthlyPurchase >= tier.minAmount ? tier : acc),
  sortedTiers[0]
);

export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24">
        <PageHeader title="Partnerský program" />

        <PartnerProgramIntro
          headline="Budujeme stabilní partnerství"
          tagline="Objemové slevy pro pravidelné odběratele Beginy."
          points={[
            "Výhodné ceny dle objemu nákupu",
            "Motivace k růstu a vyšším odběrům",
            "Marketingová i prodejní podpora",
          ]}
        />

        <PartnerTierStatus
          monthlyPurchase={mockMonthlyPurchase}
          tiers={partnerTiers}
        />

        <PartnerTierTable tiers={partnerTiers} currentTierId={currentTier.id} />

        <PartnerProgramInfo
          conditions={partnerProgramConditions}
          shipping={partnerProgramShipping}
          legalNote={partnerProgramLegalNote}
        />
      </div>

      <BottomNav items={bottomNavItems} activeHref="/" />
    </div>
  );
}

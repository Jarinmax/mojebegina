import Header from "@/components/Header";
import DecorativeMark from "@/components/DecorativeMark";
import MembershipCard from "@/components/MembershipCard";
import PartnerProgramSummary from "@/components/PartnerProgramSummary";
import PerksCarousel from "@/components/PerksCarousel";
import ReorderCard from "@/components/ReorderCard";
import QuickLinksList from "@/components/QuickLinksList";
import BottomNav from "@/components/BottomNav";
import {
  mockCustomer,
  mockPerks,
  mockLastOrder,
  quickLinks,
  bottomNavItems,
} from "@/mock/customer";
import { partnerTiers, mockMonthlyPurchase } from "@/mock/partnerProgram";

export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <Header initials={mockCustomer.initials} />
        <MembershipCard
          name={mockCustomer.name}
          memberId={mockCustomer.memberId}
          status={mockCustomer.status}
        />
        <PartnerProgramSummary
          monthlyPurchase={mockMonthlyPurchase}
          tiers={partnerTiers}
          href="/partnersky-program"
        />
        <PerksCarousel perks={mockPerks} />
        <ReorderCard summary={mockLastOrder.summary} href="/objednavky#posledni" />
        <QuickLinksList links={quickLinks} />
      </div>
      <BottomNav items={bottomNavItems} activeHref="/" />
    </div>
  );
}

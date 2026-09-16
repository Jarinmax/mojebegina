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
import { getPartnerTierStatus } from "@/lib/partnerTier";
import { unreadNotificationCount } from "@/mock/notifications";

// Karta výhody se počítá ze skutečných pravidel partnerského programu
// (stejná funkce jako PartnerProgramSummary a /partnersky-program), aby
// číslo na dashboardu nikdy neodporovalo skutečné partnerské úrovni.
const { currentTier } = getPartnerTierStatus(mockMonthlyPurchase, partnerTiers);
const partnerPerk = {
  id: "partnerska-sleva",
  title: currentTier.discountPercent
    ? `Sleva ${currentTier.discountPercent} % na další nákup`
    : currentTier.discountLabel,
  subtitle: "Vaše aktuální partnerská úroveň",
  href: "/vyhoda/partnerska-sleva",
};

export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <Header
          initials={mockCustomer.initials}
          unreadCount={unreadNotificationCount}
        />
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
        <PerksCarousel perks={[partnerPerk, ...mockPerks]} />
        <ReorderCard summary={mockLastOrder.summary} href="/objednavky#posledni" />
        <QuickLinksList links={quickLinks} />
      </div>
      <BottomNav items={bottomNavItems} activeHref="/" />
    </div>
  );
}

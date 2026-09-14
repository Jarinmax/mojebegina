import Header from "@/components/Header";
import MembershipCard from "@/components/MembershipCard";
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

export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24">
        <Header initials={mockCustomer.initials} />
        <MembershipCard
          name={mockCustomer.name}
          memberId={mockCustomer.memberId}
          status={mockCustomer.status}
        />
        <PerksCarousel perks={mockPerks} />
        <ReorderCard summary={mockLastOrder.summary} href="/historie" />
        <QuickLinksList links={quickLinks} />
      </div>
      <BottomNav items={bottomNavItems} activeHref="/" />
    </div>
  );
}

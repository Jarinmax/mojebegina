import { redirect } from "next/navigation";
import Header from "@/components/Header";
import DecorativeMark from "@/components/DecorativeMark";
import MembershipCard from "@/components/MembershipCard";
import PartnerProgramSummary from "@/components/PartnerProgramSummary";
import PerksCarousel from "@/components/PerksCarousel";
import ReorderCard from "@/components/ReorderCard";
import QuickLinksList from "@/components/QuickLinksList";
import BottomNav from "@/components/BottomNav";
import NoOrganizationNotice from "@/components/NoOrganizationNotice";
import { mockPerks, quickLinks, bottomNavItems } from "@/mock/customer";
import { partnerTiers } from "@/mock/partnerProgram";
import { getPartnerTierStatus } from "@/lib/partnerTier";
import { capitalizeFirst } from "@/lib/format";
import { getUnreadCount, getNotifications } from "@/mock/notifications";
import {
  requireCustomerContext,
  getCustomerAccount,
  getCustomerOrders,
  getCurrentMonthlyPurchase,
} from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { ctx, organizationId } = await requireCustomerContext();

  // Security Phase 5 UX fix — role-aware redirect po loginu. `ctx.systemRole`
  // pochází ze server-side session (viz getAuthContext), nikdy od klienta,
  // takže se nedá obejít změnou URL nebo requestu. ADMIN nemá organizaci, a
  // dřívější zobrazení "Váš účet není přiřazený" na "/" bylo pro admina jen
  // matoucí — patří na /admin. CUSTOMER (Veronika) se tímhle nemění.
  if (ctx.systemRole === "ADMIN") {
    redirect("/admin");
  }

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
        <DecorativeMark />
        <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
          <Header initials="?" unreadCount={0} />
          <NoOrganizationNotice />
        </div>
        <BottomNav items={bottomNavItems} activeHref="/" />
      </div>
    );
  }

  const [customerAccount, customerOrders] = await Promise.all([
    getCustomerAccount(ctx, organizationId),
    getCustomerOrders(ctx, organizationId),
  ]);
  const currentMonthlyPurchase = getCurrentMonthlyPurchase(customerOrders);
  const unreadCount = getUnreadCount(getNotifications(currentMonthlyPurchase));
  const lastOrder = customerOrders[0];

  const contactDisplayName = customerAccount.contactLastName
    ? `${customerAccount.contactFirstName} ${customerAccount.contactLastName}`
    : customerAccount.contactFirstName;

  // Karta výhody se počítá ze skutečných pravidel partnerského programu
  // (stejná funkce jako PartnerProgramSummary a /partnersky-program), aby
  // číslo na dashboardu nikdy neodporovalo skutečné partnerské úrovni.
  const { currentTier } = getPartnerTierStatus(currentMonthlyPurchase, partnerTiers);
  const partnerPerk = {
    id: "partnerska-sleva",
    title: currentTier.discountPercent
      ? `Sleva ${currentTier.discountPercent} % na další nákup`
      : capitalizeFirst(currentTier.discountLabel),
    subtitle: "Vaše aktuální partnerská úroveň",
    href: "/vyhoda/partnerska-sleva",
  };

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <Header
          initials={customerAccount.initials}
          unreadCount={unreadCount}
        />
        <MembershipCard
          name={customerAccount.companyName}
          contactName={contactDisplayName}
          memberId={customerAccount.memberId}
          status={customerAccount.status}
        />
        <PartnerProgramSummary
          monthlyPurchase={currentMonthlyPurchase}
          tiers={partnerTiers}
          href="/partnersky-program"
        />
        <PerksCarousel perks={[partnerPerk, ...mockPerks]} />
        {lastOrder && (
          <ReorderCard summary={lastOrder.products} href={`/objednavky#${lastOrder.id}`} />
        )}
        <QuickLinksList links={quickLinks} />
      </div>
      <BottomNav items={bottomNavItems} activeHref="/" />
    </div>
  );
}

// Úvodní stránka zákaznické karty — stejné komponenty a pořadí pro
// zákazníka i administrátorský náhled. Jen prezentace: data dodá stránka
// (lib/data/dashboard.ts), žádné načítání ani akce tady.
import Header from "@/components/Header";
import MembershipCard from "@/components/MembershipCard";
import PartnerProgramSummary from "@/components/PartnerProgramSummary";
import PerksCarousel from "@/components/PerksCarousel";
import ReorderCard from "@/components/ReorderCard";
import QuickLinksList from "@/components/QuickLinksList";
import { mockPerks, quickLinks, type CustomerAccount, type Order } from "@/mock/customer";
import { partnerTiers } from "@/mock/partnerProgram";
import { getPartnerTierStatus } from "@/lib/partnerTier";
import { capitalizeFirst } from "@/lib/format";
import { getUnreadCount, getNotifications } from "@/mock/notifications";
import { getCurrentMonthlyPurchase } from "@/lib/data/customerOrderMath";

export function contactDisplayName(account: CustomerAccount): string {
  return account.contactLastName ? `${account.contactFirstName} ${account.contactLastName}` : account.contactFirstName;
}

export default function CustomerHomeView({
  account,
  orders,
  showRoleSwitch,
}: {
  account: CustomerAccount;
  orders: Order[];
  showRoleSwitch: boolean;
}) {
  const currentMonthlyPurchase = getCurrentMonthlyPurchase(orders);
  const unreadCount = getUnreadCount(getNotifications(currentMonthlyPurchase));
  // „Objednat znovu“ nabízí poslední objednávku, která nebyla stornovaná.
  const lastOrder = orders.find((order) => order.status !== "Stornováno");

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
    <>
      <Header initials={account.initials} unreadCount={unreadCount} showRoleSwitch={showRoleSwitch} />
      <MembershipCard
        name={account.companyName}
        contactName={contactDisplayName(account)}
        memberId={account.memberId}
        status={account.status}
      />
      <PartnerProgramSummary monthlyPurchase={currentMonthlyPurchase} tiers={partnerTiers} href="/partnersky-program" />
      <PerksCarousel perks={[partnerPerk, ...mockPerks]} />
      {lastOrder && <ReorderCard summary={lastOrder.products} href={`/objednavky#${lastOrder.id}`} />}
      <QuickLinksList links={quickLinks} />
    </>
  );
}

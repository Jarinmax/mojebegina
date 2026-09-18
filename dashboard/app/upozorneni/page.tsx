import PageHeader from "@/components/PageHeader";
import DecorativeMark from "@/components/DecorativeMark";
import NotificationCard from "@/components/NotificationCard";
import BottomNav from "@/components/BottomNav";
import NoOrganizationNotice from "@/components/NoOrganizationNotice";
import { bottomNavItems } from "@/mock/customer";
import { getNotifications } from "@/mock/notifications";
import {
  requireCustomerContext,
  getCustomerOrders,
  getCurrentMonthlyPurchase,
} from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { ctx, organizationId } = await requireCustomerContext();

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
        <DecorativeMark />
        <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
          <PageHeader title="Upozornění" />
          <NoOrganizationNotice />
        </div>
        <BottomNav items={bottomNavItems} activeHref="/upozorneni" />
      </div>
    );
  }

  const customerOrders = await getCustomerOrders(ctx, organizationId);
  const currentMonthlyPurchase = getCurrentMonthlyPurchase(customerOrders);
  const notifications = getNotifications(currentMonthlyPurchase);

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <PageHeader title="Upozornění" />

        {notifications.map((notification) => (
          <NotificationCard key={notification.id} notification={notification} />
        ))}
      </div>

      <BottomNav items={bottomNavItems} activeHref="/upozorneni" />
    </div>
  );
}

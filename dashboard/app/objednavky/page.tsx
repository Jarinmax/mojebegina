import PageHeader from "@/components/PageHeader";
import DecorativeMark from "@/components/DecorativeMark";
import OrderCard from "@/components/OrderCard";
import BottomNav from "@/components/BottomNav";
import NoOrganizationNotice from "@/components/NoOrganizationNotice";
import { bottomNavItems } from "@/mock/customer";
import { requireCustomerContext, getCustomerOrders } from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { ctx, organizationId } = await requireCustomerContext();

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
        <DecorativeMark />
        <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
          <PageHeader title="Historie objednávek" />
          <NoOrganizationNotice />
        </div>
        <BottomNav items={bottomNavItems} activeHref="/objednavky" />
      </div>
    );
  }

  const customerOrders = await getCustomerOrders(ctx, organizationId);

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <PageHeader title="Historie objednávek" />

        {customerOrders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>

      <BottomNav items={bottomNavItems} activeHref="/objednavky" />
    </div>
  );
}

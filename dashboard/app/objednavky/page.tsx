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

        {/* nový nákup v e-shopu s předvyplněnými údaji karty (app/objednat-znovu) */}
        <a
          href="/objednat-znovu/novy"
          className="block text-center text-sm font-medium text-white bg-begina-primary-900 rounded-lg py-2.5 mb-3"
        >
          Nový nákup v e-shopu
        </a>

        {customerOrders.map((order) => (
          <OrderCard key={order.id} order={order} showPaymentAction showReorder />
        ))}
      </div>

      <BottomNav items={bottomNavItems} activeHref="/objednavky" />
    </div>
  );
}

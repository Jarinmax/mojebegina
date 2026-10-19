import { redirect } from "next/navigation";
import Header from "@/components/Header";
import DecorativeMark from "@/components/DecorativeMark";
import BottomNav from "@/components/BottomNav";
import NoOrganizationNotice from "@/components/NoOrganizationNotice";
import CustomerPortalShell from "@/components/customer-portal/CustomerPortalShell";
import CustomerHomeView from "@/components/customer-portal/CustomerHomeView";
import { bottomNavItems } from "@/mock/customer";
import { requireCustomerContext, getCustomerAccount, getCustomerOrders } from "@/lib/data/dashboard";

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

  // Security Phase 7 (Executive 1.0) — stejný princip jako u ADMIN výše.
  // EXECUTIVE nemá organizaci (cross-org READ, ne členství), takže by na
  // "/" skončil na stejné matoucí "Váš účet není přiřazený" obrazovce.
  if (ctx.systemRole === "EXECUTIVE") {
    redirect("/executive");
  }

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
        <DecorativeMark />
        <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
          <Header initials="?" unreadCount={0} showRoleSwitch={ctx.grantedRoles.length > 1} />
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

  // Obsah karty je sdílený s administrátorským náhledem
  // (app/admin/organizace/[id]/nahled) — viz components/customer-portal.
  return (
    <CustomerPortalShell activeHref="/">
      <CustomerHomeView account={customerAccount} orders={customerOrders} showRoleSwitch={ctx.grantedRoles.length > 1} />
    </CustomerPortalShell>
  );
}

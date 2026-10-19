import PageHeader from "@/components/PageHeader";
import DecorativeMark from "@/components/DecorativeMark";
import CustomerPortalShell from "@/components/customer-portal/CustomerPortalShell";
import CustomerProfileView from "@/components/customer-portal/CustomerProfileView";
import BottomNav from "@/components/BottomNav";
import NoOrganizationNotice from "@/components/NoOrganizationNotice";
import SignOutButton from "@/components/SignOutButton";
import { bottomNavItems } from "@/mock/customer";
import { requireCustomerContext, getCustomerAccount } from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

// Firemní zákaznická karta. Sekce jsou rozdělené tak, aby se profil mohl
// postupně stát hlavní osobní kartou zákazníka — údaje, které zatím
// neznáme, zobrazujeme jako "Neuvedeno", nic se nevymýšlí.
export default async function Page() {
  const { ctx, organizationId } = await requireCustomerContext();

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
        <DecorativeMark />
        <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
          <PageHeader title="Můj profil" />
          <NoOrganizationNotice />
          <div className="mt-4">
            <SignOutButton />
          </div>
        </div>
        <BottomNav items={bottomNavItems} activeHref="/profil" />
      </div>
    );
  }

  const customerAccount = await getCustomerAccount(ctx, organizationId);

  return (
    <CustomerPortalShell activeHref="/profil">
      <CustomerProfileView account={customerAccount} accountActions={<SignOutButton />} />
    </CustomerPortalShell>
  );
}

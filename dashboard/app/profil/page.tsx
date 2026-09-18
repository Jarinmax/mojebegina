import PageHeader from "@/components/PageHeader";
import DecorativeMark from "@/components/DecorativeMark";
import ProfileSection from "@/components/ProfileSection";
import ProfileField from "@/components/ProfileField";
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
  const contactDisplayName = customerAccount.contactLastName
    ? `${customerAccount.contactFirstName} ${customerAccount.contactLastName}`
    : customerAccount.contactFirstName;

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <PageHeader title="Můj profil" />

        <ProfileSection title="Firemní údaje">
          <ProfileField label="Název firmy" value={customerAccount.companyName} />
          <ProfileField label="IČ" value={customerAccount.ico} />
        </ProfileSection>

        <ProfileSection title="Kontaktní osoba">
          <ProfileField label="Jméno" value={contactDisplayName} />
        </ProfileSection>

        <ProfileSection title="Sídlo">
          <ProfileField label="Adresa" value={customerAccount.registeredAddress} />
        </ProfileSection>

        <ProfileSection title="Kontaktní údaje">
          <ProfileField label="E-mail" value={customerAccount.email ?? "Neuvedeno"} />
          <ProfileField label="Telefon" value={customerAccount.phone ?? "Neuvedeno"} />
        </ProfileSection>

        <ProfileSection title="Nastavení účtu">
          <div className="py-3 flex flex-col gap-2">
            <button
              type="button"
              className="w-full text-sm font-medium text-begina-primary-900 border border-begina-primary-700 rounded-lg py-2.5"
            >
              Upravit profil
            </button>
            <SignOutButton />
          </div>
        </ProfileSection>
      </div>

      <BottomNav items={bottomNavItems} activeHref="/profil" />
    </div>
  );
}

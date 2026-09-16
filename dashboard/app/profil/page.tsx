import PageHeader from "@/components/PageHeader";
import DecorativeMark from "@/components/DecorativeMark";
import ProfileSection from "@/components/ProfileSection";
import ProfileField from "@/components/ProfileField";
import BottomNav from "@/components/BottomNav";
import { bottomNavItems } from "@/mock/customer";
import { mockProfile } from "@/mock/profile";

// Struktura je rozdělená do sekcí (osobní údaje, kontaktní údaje,
// doručovací adresa, nastavení účtu), aby se profil mohl postupně
// stát hlavní osobní kartou zákazníka — data zůstávají stejná mock
// hodnoty jako předtím, mění se jen jejich uspořádání.
export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <PageHeader title="Můj profil" />

        <ProfileSection title="Osobní údaje">
          <ProfileField label="Jméno" value={mockProfile.name} />
          <ProfileField label="Členské číslo" value={mockProfile.memberId} />
        </ProfileSection>

        <ProfileSection title="Kontaktní údaje">
          <ProfileField label="E-mail" value={mockProfile.email} />
          <ProfileField label="Telefon" value={mockProfile.phone} />
        </ProfileSection>

        <ProfileSection title="Doručovací adresa">
          <ProfileField label="Adresa" value={mockProfile.address} />
        </ProfileSection>

        <ProfileSection title="Nastavení účtu">
          <div className="py-3">
            <button
              type="button"
              className="w-full text-sm font-medium text-begina-primary-900 border border-begina-primary-700 rounded-lg py-2.5"
            >
              Upravit profil
            </button>
          </div>
        </ProfileSection>
      </div>

      <BottomNav items={bottomNavItems} activeHref="/profil" />
    </div>
  );
}

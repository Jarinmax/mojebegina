import PageHeader from "@/components/PageHeader";
import DecorativeMark from "@/components/DecorativeMark";
import ProfileField from "@/components/ProfileField";
import BottomNav from "@/components/BottomNav";
import { bottomNavItems } from "@/mock/customer";
import { mockProfile } from "@/mock/profile";

export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <PageHeader title="Můj profil" />

        <div className="bg-white border border-neutral-200 rounded-xl px-3.5 mb-4">
          <ProfileField label="Jméno" value={mockProfile.name} />
          <ProfileField label="Členské číslo" value={mockProfile.memberId} />
          <ProfileField label="E-mail" value={mockProfile.email} />
          <ProfileField label="Telefon" value={mockProfile.phone} />
          <ProfileField label="Doručovací adresa" value={mockProfile.address} />
        </div>

        <button
          type="button"
          className="w-full text-sm font-medium text-begina-primary-900 border border-begina-primary-700 rounded-lg py-2.5"
        >
          Upravit profil
        </button>
      </div>

      <BottomNav items={bottomNavItems} activeHref="/profil" />
    </div>
  );
}

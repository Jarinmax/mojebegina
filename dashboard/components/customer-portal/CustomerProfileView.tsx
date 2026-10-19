// Profil zákaznické karty — sdílený pro zákazníka i admin náhled.
// `accountActions` dodá stránka: zákazník skutečné „Odhlásit se“, admin
// náhled jen neaktivní kopii (odhlášení by jinak odhlásilo administrátora).
import PageHeader from "@/components/PageHeader";
import ProfileSection from "@/components/ProfileSection";
import ProfileField from "@/components/ProfileField";
import type { CustomerAccount } from "@/mock/customer";
import { contactDisplayName } from "./CustomerHomeView";

export default function CustomerProfileView({
  account,
  accountActions,
}: {
  account: CustomerAccount;
  accountActions: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title="Můj profil" />

      <ProfileSection title="Firemní údaje">
        <ProfileField label="Název firmy" value={account.companyName} />
        <ProfileField label="IČ" value={account.ico} />
      </ProfileSection>

      <ProfileSection title="Kontaktní osoba">
        <ProfileField label="Jméno" value={contactDisplayName(account)} />
      </ProfileSection>

      <ProfileSection title="Sídlo">
        <ProfileField label="Adresa" value={account.registeredAddress} />
      </ProfileSection>

      <ProfileSection title="Kontaktní údaje">
        <ProfileField label="E-mail" value={account.email ?? "Neuvedeno"} />
        <ProfileField label="Telefon" value={account.phone ?? "Neuvedeno"} />
      </ProfileSection>

      <ProfileSection title="Nastavení účtu">
        <div className="py-3 flex flex-col gap-2">
          <button
            type="button"
            className="w-full text-sm font-medium text-begina-primary-900 border border-begina-primary-700 rounded-lg py-2.5"
          >
            Upravit profil
          </button>
          {accountActions}
        </div>
      </ProfileSection>
    </>
  );
}

import Image from "next/image";
import logoMark from "@/public/logo-begina-mark.png";
import AdminSignOutButton from "@/components/admin/AdminSignOutButton";
import SwitchRoleLink from "@/components/roles/SwitchRoleLink";
import BackLink from "./BackLink";

// Security Phase 8 — strukturálně stejný jako AdminHeader/ExecutiveHeader,
// jen s odkazem „Zpět" o jeden krok výš (BackLink); z kořene sekce vede na
// dashboard role (ADMIN → /admin, EXECUTIVE → /executive).
// AdminSignOutButton je bezpečné znovupoužít beze změny — je role-agnostic
// (jen volá authClient.signOut() a přesměruje na /login).
type Props = {
  name: string | null;
  email: string;
  backHref: string;
  showRoleSwitch?: boolean;
};

export default function CompanyOverviewHeader({
  name,
  email,
  backHref,
  showRoleSwitch = false,
}: Props) {
  return (
    <header className="bg-white border-b border-neutral-200">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src={logoMark} alt="Begina" className="h-7 w-auto" priority />
          <span className="text-sm font-medium text-begina-primary-900">Begina — Řízení firmy</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-neutral-500 hidden sm:inline">{name ?? email}</span>
          <SwitchRoleLink visible={showRoleSwitch} />
          <AdminSignOutButton />
        </div>
      </div>
      <nav className="max-w-5xl mx-auto px-4">
        <BackLink fallback={backHref} />
      </nav>
    </header>
  );
}

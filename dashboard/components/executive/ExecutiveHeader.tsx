import Image from "next/image";
import Link from "next/link";
import logoMark from "@/public/logo-begina-mark.png";
import AdminSignOutButton from "@/components/admin/AdminSignOutButton";
import SwitchRoleLink from "@/components/roles/SwitchRoleLink";

// Security Phase 7 (Executive 1.0) — strukturálně stejný jako AdminHeader
// (viz components/admin/AdminHeader.tsx), jen s jiným titulkem a bez
// jakéhokoli odkazu na akce, které EXECUTIVE nemá. AdminSignOutButton je
// bezpečné znovupoužít beze změny — jen volá authClient.signOut() a
// přesměruje na /login, nekontroluje ani nevyžaduje žádnou konkrétní roli.
type ExecutiveHeaderProps = {
  name: string | null;
  email: string;
  showRoleSwitch?: boolean;
};

export default function ExecutiveHeader({
  name,
  email,
  showRoleSwitch = false,
}: ExecutiveHeaderProps) {
  return (
    <header className="bg-white border-b border-neutral-200">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src={logoMark} alt="Begina" className="h-7 w-auto" priority />
          <span className="text-sm font-medium text-begina-primary-900">Begina Executive</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-neutral-500 hidden sm:inline">{name ?? email}</span>
          <SwitchRoleLink visible={showRoleSwitch} />
          <AdminSignOutButton />
        </div>
      </div>
      <nav className="max-w-5xl mx-auto px-4">
        <Link
          href="/executive"
          className="inline-block text-sm font-medium text-begina-primary-900 border-b-2 border-begina-accent-700 py-2"
        >
          Organizace
        </Link>
      </nav>
    </header>
  );
}

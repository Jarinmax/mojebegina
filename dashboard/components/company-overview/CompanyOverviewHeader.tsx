import Image from "next/image";
import Link from "next/link";
import logoMark from "@/public/logo-begina-mark.png";
import AdminSignOutButton from "@/components/admin/AdminSignOutButton";

// Security Phase 8 — strukturálně stejný jako AdminHeader/ExecutiveHeader,
// jen s odkazem zpátky na dashboard té role, ze které uživatel přišel
// (ADMIN → /admin, EXECUTIVE → /executive), místo vlastní navigace.
// AdminSignOutButton je bezpečné znovupoužít beze změny — je role-agnostic
// (jen volá authClient.signOut() a přesměruje na /login).
type Props = {
  name: string | null;
  email: string;
  backHref: string;
};

export default function CompanyOverviewHeader({ name, email, backHref }: Props) {
  return (
    <header className="bg-white border-b border-neutral-200">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src={logoMark} alt="Begina" className="h-7 w-auto" priority />
          <span className="text-sm font-medium text-begina-primary-900">Begina — Řízení firmy</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-neutral-500 hidden sm:inline">{name ?? email}</span>
          <AdminSignOutButton />
        </div>
      </div>
      <nav className="max-w-5xl mx-auto px-4">
        <Link
          href={backHref}
          className="inline-block text-sm font-medium text-neutral-500 hover:text-begina-primary-900 py-2"
        >
          ← Zpět
        </Link>
      </nav>
    </header>
  );
}

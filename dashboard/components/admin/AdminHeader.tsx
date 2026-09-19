import Image from "next/image";
import Link from "next/link";
import logoMark from "@/public/logo-begina-mark.png";
import AdminSignOutButton from "./AdminSignOutButton";

type AdminHeaderProps = {
  name: string | null;
  email: string;
};

export default function AdminHeader({ name, email }: AdminHeaderProps) {
  return (
    <header className="bg-white border-b border-neutral-200">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src={logoMark} alt="Begina" className="h-7 w-auto" priority />
          <span className="text-sm font-medium text-begina-primary-900">Begina Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-neutral-500 hidden sm:inline">{name ?? email}</span>
          <AdminSignOutButton />
        </div>
      </div>
      <nav className="max-w-5xl mx-auto px-4">
        <Link
          href="/admin"
          className="inline-block text-sm font-medium text-begina-primary-900 border-b-2 border-begina-accent-700 py-2"
        >
          Organizace
        </Link>
      </nav>
    </header>
  );
}

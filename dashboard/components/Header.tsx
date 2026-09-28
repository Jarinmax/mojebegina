import Link from "next/link";
import Image from "next/image";
import { Bell } from "lucide-react";
import logoMark from "@/public/logo-begina-mark.png";
import SwitchRoleLink from "@/components/roles/SwitchRoleLink";

type HeaderProps = {
  initials: string;
  unreadCount?: number;
  showRoleSwitch?: boolean;
};

export default function Header({ initials, unreadCount = 0, showRoleSwitch = false }: HeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-3">
      <Image
        src={logoMark}
        alt="Begina"
        className="h-8 w-auto shrink-0"
        priority
      />
      <div className="flex items-center gap-3 shrink-0">
        <SwitchRoleLink visible={showRoleSwitch} />
        <Link
          href="/upozorneni"
          aria-label="Oznámení"
          className="relative shrink-0 text-neutral-500"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-begina-accent-700 text-white text-[10px] font-medium flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Link>
        <Link
          href="/profil"
          aria-label="Můj profil"
          className="w-7 h-7 shrink-0 rounded-full bg-begina-primary-100 flex items-center justify-center text-xs font-medium text-begina-primary-800"
        >
          {initials}
        </Link>
      </div>
    </div>
  );
}

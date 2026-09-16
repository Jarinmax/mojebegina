import Link from "next/link";
import Image from "next/image";
import { Bell } from "lucide-react";
import logoMark from "@/public/logo-begina-mark.png";

type HeaderProps = {
  initials: string;
  unreadCount?: number;
};

export default function Header({ initials, unreadCount = 0 }: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-2 py-3">
      <Image
        src={logoMark}
        alt="Begina"
        className="h-8 w-auto"
        priority
      />
      <div className="flex items-center gap-3">
        <Link
          href="/upozorneni"
          aria-label="Oznámení"
          className="relative text-neutral-500"
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
          className="w-7 h-7 rounded-full bg-begina-primary-100 flex items-center justify-center text-xs font-medium text-begina-primary-800"
        >
          {initials}
        </Link>
      </div>
    </div>
  );
}

import Image from "next/image";
import { Bell } from "lucide-react";
import logoMark from "@/public/logo-begina-mark.png";

type HeaderProps = {
  initials: string;
};

export default function Header({ initials }: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-2 py-3">
      <Image
        src={logoMark}
        alt="Begina"
        className="h-8 w-auto"
        priority
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Oznámení"
          className="text-neutral-500"
        >
          <Bell className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-full bg-begina-primary-100 flex items-center justify-center text-xs font-medium text-begina-primary-800">
          {initials}
        </div>
      </div>
    </div>
  );
}

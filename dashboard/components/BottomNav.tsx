import Link from "next/link";
import { Home, Package, Users, User, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  package: Package,
  users: Users,
  user: User,
};

type NavItem = {
  icon: string;
  label: string;
  href: string;
};

type BottomNavProps = {
  items: readonly NavItem[];
  activeHref?: string;
};

export default function BottomNav({ items, activeHref = "/" }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[380px] mx-auto flex justify-around py-2.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? Home;
          const isActive = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 ${
                isActive ? "text-begina-primary-700" : "text-neutral-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

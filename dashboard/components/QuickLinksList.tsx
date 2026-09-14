import Link from "next/link";
import { History, Users, User, ChevronRight, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  history: History,
  users: Users,
  user: User,
};

type QuickLink = {
  icon: string;
  label: string;
  href: string;
  badge?: string;
};

type QuickLinksListProps = {
  links: readonly QuickLink[];
};

export default function QuickLinksList({ links }: QuickLinksListProps) {
  return (
    <div className="flex flex-col gap-2 mb-4">
      {links.map((link) => {
        const Icon = ICONS[link.icon] ?? User;
        return (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 bg-white border border-neutral-200 rounded-xl px-3.5 py-3"
          >
            <span className="text-neutral-600">
              <Icon className="w-5 h-5" />
            </span>
            <span className="text-sm flex-1">{link.label}</span>
            {link.badge && (
              <span className="text-[11px] font-medium text-begina-primary-700 bg-begina-primary-100 rounded-full px-2 py-0.5">
                {link.badge}
              </span>
            )}
            <span className="text-neutral-400">
              <ChevronRight className="w-4 h-4" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

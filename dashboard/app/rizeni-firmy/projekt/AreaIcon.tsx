import { Binoculars, Boxes, Coffee, FileText, Globe, Handshake, Image, LayoutDashboard, Megaphone, Package, Scale, Search, Share2, ShieldCheck, ShoppingCart, Tag, UtensilsCrossed, Wallet } from "lucide-react";
import type { ProjectArea } from "@/lib/projekt/areas";

// Barvy jsou celé názvy tříd (Tailwind je musí najít ve zdrojáku).
export const TONES: Record<ProjectArea["tone"], { tile: string; icon: string; text: string }> = {
  rose: { tile: "bg-rose-50 border-rose-200 hover:border-rose-400", icon: "bg-rose-100 text-rose-700", text: "text-rose-900" },
  amber: { tile: "bg-amber-50 border-amber-200 hover:border-amber-400", icon: "bg-amber-100 text-amber-700", text: "text-amber-900" },
  violet: { tile: "bg-violet-50 border-violet-200 hover:border-violet-400", icon: "bg-violet-100 text-violet-700", text: "text-violet-900" },
  sky: { tile: "bg-sky-50 border-sky-200 hover:border-sky-400", icon: "bg-sky-100 text-sky-700", text: "text-sky-900" },
  emerald: { tile: "bg-emerald-50 border-emerald-200 hover:border-emerald-400", icon: "bg-emerald-100 text-emerald-700", text: "text-emerald-900" },
  slate: { tile: "bg-slate-50 border-slate-200 hover:border-slate-400", icon: "bg-slate-200 text-slate-700", text: "text-slate-900" },
  lime: { tile: "bg-lime-50 border-lime-200 hover:border-lime-400", icon: "bg-lime-100 text-lime-700", text: "text-lime-900" },
  orange: { tile: "bg-orange-50 border-orange-200 hover:border-orange-400", icon: "bg-orange-100 text-orange-700", text: "text-orange-900" },
  blue: { tile: "bg-blue-50 border-blue-200 hover:border-blue-400", icon: "bg-blue-100 text-blue-700", text: "text-blue-900" },
  stone: { tile: "bg-stone-50 border-stone-200 hover:border-stone-400", icon: "bg-stone-200 text-stone-700", text: "text-stone-900" },
  teal: { tile: "bg-teal-50 border-teal-200 hover:border-teal-400", icon: "bg-teal-100 text-teal-700", text: "text-teal-900" },
  fuchsia: { tile: "bg-fuchsia-50 border-fuchsia-200 hover:border-fuchsia-400", icon: "bg-fuchsia-100 text-fuchsia-700", text: "text-fuchsia-900" },
  cyan: { tile: "bg-cyan-50 border-cyan-200 hover:border-cyan-400", icon: "bg-cyan-100 text-cyan-700", text: "text-cyan-900" },
  indigo: { tile: "bg-indigo-50 border-indigo-200 hover:border-indigo-400", icon: "bg-indigo-100 text-indigo-700", text: "text-indigo-900" },
  yellow: { tile: "bg-yellow-50 border-yellow-200 hover:border-yellow-400", icon: "bg-yellow-100 text-yellow-800", text: "text-yellow-900" },
  green: { tile: "bg-green-50 border-green-200 hover:border-green-400", icon: "bg-green-100 text-green-700", text: "text-green-900" },
  red: { tile: "bg-red-50 border-red-200 hover:border-red-400", icon: "bg-red-100 text-red-700", text: "text-red-900" },
};

const ICONS = {
  share: Share2,
  tag: Tag,
  image: Image,
  binoculars: Binoculars,
  globe: Globe,
  scale: Scale,
  wallet: Wallet,
  cart: ShoppingCart,
  file: FileText,
  coffee: Coffee,
  handshake: Handshake,
  megaphone: Megaphone,
  search: Search,
  dashboard: LayoutDashboard,
  package: Package,
  boxes: Boxes,
  shield: ShieldCheck,
  utensils: UtensilsCrossed,
} as const;

export default function AreaIcon({ area, size = "md" }: { area: ProjectArea; size?: "md" | "lg" }) {
  const Icon = ICONS[area.icon];
  const box = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <span className={`inline-flex ${box} shrink-0 items-center justify-center rounded-xl ${TONES[area.tone].icon}`} aria-hidden="true">
      <Icon className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} />
    </span>
  );
}

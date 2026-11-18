import { Binoculars, Globe, Image, Scale, Share2, Tag, Wallet } from "lucide-react";
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
};

const ICONS = { share: Share2, tag: Tag, image: Image, binoculars: Binoculars, globe: Globe, scale: Scale, wallet: Wallet } as const;

export default function AreaIcon({ area, size = "md" }: { area: ProjectArea; size?: "md" | "lg" }) {
  const Icon = ICONS[area.icon];
  const box = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <span className={`inline-flex ${box} shrink-0 items-center justify-center rounded-xl ${TONES[area.tone].icon}`} aria-hidden="true">
      <Icon className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} />
    </span>
  );
}

import { Calculator, Droplets, Leaf, Recycle, Timer, Truck } from "lucide-react";
import { CAFE_BENEFITS, type CafeIcon } from "@/lib/eshop/cafePage";

const ICONS: Record<CafeIcon, typeof Leaf> = { recycle: Recycle, timer: Timer, calculator: Calculator, leaf: Leaf, droplets: Droplets, truck: Truck };

/**
 * Výhody pro provozy (texty z lib/eshop/cafePage.ts) — stránka Pro kavárny a bistra
 * a od 20. 11. 2026 i úvodní stránka („Proč Beginu berou kavárny a bistra“).
 */
export default function CafeBenefits({ headingLevel = "h2" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {CAFE_BENEFITS.map((benefit) => {
        const Icon = ICONS[benefit.icon];
        return (
          <li key={benefit.title} className="rounded-2xl bg-[#FAF6EF] border border-[#EDE5D8] p-5 flex gap-4 text-left">
            <Icon className="flex-none w-7 h-7 text-[#5E6B34]" aria-hidden="true" />
            <div>
              <Heading className="font-semibold text-lg leading-snug text-[#2A2622]">{benefit.title}</Heading>
              <p className="mt-1 text-base leading-normal text-neutral-700">{benefit.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

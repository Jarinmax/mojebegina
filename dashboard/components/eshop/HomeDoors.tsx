import Image from "next/image";
import { ArrowRight } from "lucide-react";
import ShopLink from "./ShopLink";
import { HOME_DOORS } from "@/lib/eshop/homeContent";

// 28. 11. 2026 (Lucie + Jarin): hned pod úvodem dvě velké dlaždice – Pro kavárny a bistra / Domů.
// Každý zákazník si klikne na svou cestu; nahrazují pruh „Nakupujete domů?“ pod cenami porcí.
export default function HomeDoors({ homeText }: { homeText?: string }) {
  return (
    <section className="max-w-6xl mx-auto px-4 pt-6 sm:pt-8" aria-label="Pro koho">
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {HOME_DOORS.map((door) => (
          <li key={door.href}>
            <ShopLink href={door.href} className="group grid grid-cols-[40%_1fr] items-center gap-4 overflow-hidden rounded-2xl bg-[#F0EADF] hover:bg-[#EAE2D3] transition-colors h-full">
              <span className="relative block aspect-[4/5] w-full">
                <Image src={door.photo} alt={door.alt} fill sizes="(min-width: 768px) 14rem, 40vw" className="object-cover" />
              </span>
              <span className="block py-4 pr-4">
                <span className="block font-serif text-2xl sm:text-[1.9rem] leading-tight text-[#2A2622]">{door.title}</span>
                <span className="mt-1.5 block text-base leading-snug text-neutral-700">{door.href === "/nakupuji-domu" && homeText ? homeText : door.text}</span>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-[#4A5527] px-4 py-2 text-sm font-semibold text-[#4A5527] group-hover:bg-[#4A5527] group-hover:text-white transition-colors">
                  {door.button}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </span>
            </ShopLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

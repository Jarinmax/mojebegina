import { Check } from "lucide-react";
import ShopLink from "./ShopLink";

// Dlaždice na úvodní stránce (Pro kavárny a bistra / Nakupuji domů).
// 22. 11. 2026 (Lucie): odkaz na polévky pro kavárny až pod tlačítkem, ať je „Chci ochutnávku do provozu“ hned vidět.
type Tile = { title: string; points: readonly string[]; button: string; href: string; extraText?: string; extraLink?: { label: string; href: string } };

export default function HomeTile({ tile, prominent = false }: { tile: Tile; prominent?: boolean }) {
  return (
    <div
      className={
        prominent
          ? "rounded-2xl border-2 border-[#5E6B34] bg-[#FAF6EF] p-5 sm:p-6 flex flex-col"
          : "rounded-2xl border border-[#EDE5D8] bg-white p-5 sm:p-6 flex flex-col"
      }
    >
      <h2 className="font-serif text-2xl text-[#2A2622]">{tile.title}</h2>
      <ul className="mt-3 flex flex-col gap-2 text-base leading-normal text-neutral-800">
        {tile.points.map((point) => (
          <li key={point} className="flex gap-2.5">
            <Check className="flex-none mt-0.5 w-5 h-5 text-[#5E6B34]" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <ShopLink
        href={tile.href}
        className={
          prominent
            ? "mt-4 self-start rounded-full border-2 border-[#5E6B34] bg-[#5E6B34] px-6 py-2.5 text-base font-semibold text-white hover:bg-[#4A5527]"
            : "mt-4 self-start rounded-full border-2 border-[#5E6B34] px-6 py-2.5 text-base font-semibold text-[#4A5527] hover:bg-[#FAF6EF]"
        }
      >
        {tile.button}
      </ShopLink>
      {tile.extraText && tile.extraLink && (
        <p className="mt-3 text-sm leading-normal text-neutral-600">
          {tile.extraText}{" "}
          <ShopLink href={tile.extraLink.href} className="font-semibold text-[#4A5527] underline underline-offset-4">
            {tile.extraLink.label} →
          </ShopLink>
        </p>
      )}
    </div>
  );
}

import Link from "next/link";
import type { CockpitCounts } from "@/lib/data/leads";

// Security Phase 16 (Obchod/CRM 1.0) — vrchní dlaždice kokpitu, stejný
// vizuální vzor jako OrderSummaryTiles. Vždy odráží JEN přihlášeného
// uživatele (viz getCockpitCounts komentář), proto neberou view=mine/all.
// Dlaždice vedou do "Moje leady" (seřazené podle naléhavosti follow-upu —
// viz listLeads) / "Moji zákazníci", ne na vlastní pod-filtr — přesná
// hodnota dlaždice odpovídá tomu, co je v tom pohledu vidět NAHOŘE.
const TILES: { key: keyof CockpitCounts; label: string; href: string }[] = [
  { key: "toCallToday", label: "Dnes k zavolání", href: "/rizeni-firmy/obchod?view=moje-leady" },
  { key: "followUp7d", label: "Follow-up (7 dní)", href: "/rizeni-firmy/obchod?view=moje-leady" },
  { key: "negotiating", label: "Rozjednané", href: "/rizeni-firmy/obchod?view=moje-leady" },
  { key: "newCustomers30d", label: "Noví zákazníci (30 dní)", href: "/rizeni-firmy/obchod?view=moji-zakaznici" },
];

export default function CockpitTiles({ counts }: { counts: CockpitCounts }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {TILES.map((tile) => (
        <Link
          key={tile.key}
          href={tile.href}
          className="bg-white border border-neutral-200 rounded-xl p-3 hover:border-begina-primary-300 transition-colors"
        >
          <p className="text-xl font-medium text-begina-primary-900">{counts[tile.key]}</p>
          <p className="text-xs text-neutral-500">{tile.label}</p>
        </Link>
      ))}
    </div>
  );
}

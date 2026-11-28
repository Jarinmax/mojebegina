import Link from "next/link";

// Finance (Lucie 23. 11. 2026): Ekonomika, Faktury a Doklady pod jednou
// dlaždicí se třemi záložkami. Adresy stránek zůstávají, jen se přeskupily.
export type PenizeTab = "prehled" | "faktury" | "uctenky" | "zisk";

const TABS: { key: PenizeTab; label: string; href: string; icon: string }[] = [
  { key: "prehled", label: "Přehled", href: "/rizeni-firmy/ekonomika", icon: "📊" },
  { key: "faktury", label: "Příjmy – faktury", href: "/rizeni-firmy/faktury", icon: "🧾" },
  { key: "uctenky", label: "Náklady – účtenky", href: "/rizeni-firmy/doklady?tab=naklady", icon: "🛒" },
  // Lucie 28. 11. 2026: zisk Beginy po surovinách a obalech + kolik surovin měsíčně.
  { key: "zisk", label: "Zisk Beginy", href: "/rizeni-firmy/zisk", icon: "💹" },
];

export default function PenizeTabs({ active }: { active: PenizeTab }) {
  return (
    <div className="mb-4">
      <Link href="/rizeni-firmy" className="text-sm text-begina-primary-700">← Řízení firmy</Link>
      <h1 className="text-xl font-semibold text-begina-primary-900 mt-1">Finance</h1>
      {/* 26. 11. 2026 (Lucie): záložky byly nenápadné a Příjmy/Náklady „schované vedle přehledu“ — teď tři velká tlačítka. */}
      <nav aria-label="Finance" className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={`rounded-xl border px-2 py-3 text-center text-sm font-semibold ${
              t.key === active
                ? "border-begina-primary-900 bg-begina-primary-900 text-white"
                : "border-neutral-300 bg-white text-begina-primary-900 hover:border-begina-primary-900"
            }`}
          >
            <span className="block text-lg leading-none mb-1" aria-hidden="true">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

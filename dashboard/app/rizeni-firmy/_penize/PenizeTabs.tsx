import Link from "next/link";

// Finance (Lucie 23. 11. 2026): Ekonomika, Faktury a Doklady pod jednou
// dlaždicí se třemi záložkami. Adresy stránek zůstávají, jen se přeskupily.
export type PenizeTab = "prehled" | "faktury" | "uctenky";

const TABS: { key: PenizeTab; label: string; href: string }[] = [
  { key: "prehled", label: "Přehled", href: "/rizeni-firmy/ekonomika" },
  { key: "faktury", label: "Příjmy (faktury)", href: "/rizeni-firmy/faktury" },
  { key: "uctenky", label: "Náklady (účtenky)", href: "/rizeni-firmy/doklady?tab=naklady" },
];

export default function PenizeTabs({ active }: { active: PenizeTab }) {
  return (
    <div className="mb-4">
      <Link href="/rizeni-firmy" className="text-sm text-begina-primary-700">← Řízení firmy</Link>
      <h1 className="text-xl font-semibold text-begina-primary-900 mt-1">Finance</h1>
      <nav aria-label="Finance" className="mt-2 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              t.key === active ? "border-begina-primary-900 text-begina-primary-900" : "border-transparent text-neutral-500 hover:text-begina-primary-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

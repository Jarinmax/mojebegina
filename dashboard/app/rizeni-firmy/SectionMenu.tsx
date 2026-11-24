import Link from "next/link";

// Rozcestník Řízení firmy (17. 11. 2026, přání Lucie): všechny oddíly nahoře
// ve skupinách, aby se nemuselo scrollovat a hledat dole. Jen odkazy —
// oprávnění se tu NEROZHODUJÍ, stránka předává hotové příznaky (stejné jako
// dřív u jednotlivých karet) a skutečné vynucení zůstává na cílových
// stránkách a v datové vrstvě.
export type SectionMenuFlags = {
  /** Jen Jaroslav a Lucie (isInvoiceIssuer) — Ekonomika, Receptury, Projekt, Legislativa. */
  ekonomika: boolean;
  ceoFocus: boolean;
  sklad: boolean;
  agent: boolean;
  /** Spolupracovníci — jen role ADMIN. */
  admin: boolean;
  /** Manuál pro obchodníky — jen Viner, Lucie a Blahout (canReadSalesManual). */
  manual?: boolean;
};

type Item = { href: string; label: string; icon: string; show?: (f: SectionMenuFlags) => boolean };
type Group = { title: string; items: Item[] };

export const SECTION_GROUPS: Group[] = [
  {
    title: "Obchod",
    items: [
      { href: "/rizeni-firmy/obchod", label: "Obchod / CRM", icon: "📞" },
      { href: "/rizeni-firmy/obchod/manual", label: "Manuál pro obchodníky", icon: "📘", show: (f) => f.manual === true },
    ],
  },
  {
    title: "Prodej",
    items: [
      { href: "/rizeni-firmy/objednavky", label: "Objednávky", icon: "📦" },
      { href: "/rizeni-firmy/objednavky-po-terminu", label: "Objednávky po termínu", icon: "⏰" },
      { href: "/rizeni-firmy/partnersky-program", label: "Partnerský program", icon: "🤝" },
      { href: "/rizeni-firmy/kampan-set", label: "Kampaň set", icon: "🎁", show: (f) => f.ekonomika },
    ],
  },
  {
    title: "Výroba",
    items: [
      { href: "/rizeni-firmy/vyroba", label: "Výroba a expedice", icon: "🏭" },
      { href: "/rizeni-firmy/receptury", label: "Receptury a náklady", icon: "🥣", show: (f) => f.ekonomika },
      { href: "/rizeni-firmy/receptury/cenik", label: "Ceník surovin a obalů", icon: "🧾", show: (f) => f.ekonomika },
      { href: "/rizeni-firmy/etikety", label: "Etikety", icon: "🏷️" },
      // 21. 11. 2026 (Lucie): „Nová příjemka (foto)“ a „Sklad a příjemky“ z
      // rozcestníku pryč — dělaly zmatek s vláknem Účtenky (nákupy se zapisují
      // tam → Ekonomika a Doklady). Stránky /rizeni-firmy/sklad i data zůstávají.
      // 24. 11. 2026 (Lucie): „Slovenské listy“ z rozcestníku pryč — nahradily je
      // slovenské etikety (Etikety → Slovenské etikety). Stránka /rizeni-firmy/slovenske-listy zůstává.
      { href: "/rizeni-firmy/haccp", label: "HACCP", icon: "🧼" },
    ],
  },
  {
    title: "E-shop",
    items: [
      { href: "/rizeni-firmy/fotky-eshop", label: "Fotky na e-shop", icon: "📷" },
      { href: "/rizeni-firmy/mereni-eshopu", label: "Měření e-shopu", icon: "📈" },
      { href: "/rizeni-firmy/doprava-kalkulacka", label: "Doprava CoolBalík", icon: "🚚" },
    ],
  },
  {
    title: "Finance a vedení",
    items: [
      // 23. 11. 2026 (Lucie): Ekonomika, Faktury a Doklady pod jednou dlaždicí
      // „Finance“ se záložkami Přehled / Faktury / Účtenky (stránky zůstávají).
      { href: "/rizeni-firmy/ekonomika", label: "Finance (přehled, příjmy, náklady)", icon: "💰", show: (f) => f.ekonomika },
      { href: "/rizeni-firmy/ceo", label: "CEO přehled", icon: "🎯", show: (f) => f.ceoFocus },
      { href: "/rizeni-firmy/legislativni-audit", label: "Legislativní audit", icon: "⚖️", show: (f) => f.ekonomika },
    ],
  },
  {
    title: "Tým a nástroje",
    items: [
      { href: "/spoluprace/lucie", label: "Lucie — spolupráce", icon: "🐝", show: (f) => f.admin },
      { href: "/vyroba/petr", label: "Petr — výroba", icon: "👨‍🍳", show: (f) => f.admin },
      { href: "/rizeni-firmy/asistent", label: "Asistent ChatGPT", icon: "🤖", show: (f) => f.agent },
      { href: "/rizeni-firmy/projekt", label: "Poznámky pro asistenta", icon: "🗂️", show: (f) => f.ekonomika },
      { href: "#mapa-firmy", label: "Mapa firmy a zápisy", icon: "🧭" },
    ],
  },
];

export function visibleGroups(flags: SectionMenuFlags): Group[] {
  return SECTION_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.show || i.show(flags)) })).filter(
    (g) => g.items.length > 0,
  );
}

export default function SectionMenu({ flags }: { flags: SectionMenuFlags }) {
  const groups = visibleGroups(flags);
  return (
    <nav aria-label="Oddíly Řízení firmy" className="mb-6 grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
      {groups.map((group) => (
        <section key={group.title} className="bg-white border border-neutral-200 rounded-xl p-2 sm:p-3 min-w-0">
          <h2 className="px-1 mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{group.title}</h2>
          <ul className="flex flex-col">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-begina-primary-900 hover:bg-begina-primary-50"
                >
                  <span aria-hidden className="shrink-0 w-5 text-center">{item.icon}</span>
                  <span className="min-w-0 leading-tight">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

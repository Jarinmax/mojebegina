// Mock data pro vizuální prototyp dashboardu "Moje Begina".
// Žádné napojení na backend / WooCommerce — jen ukázková data.

export const mockCustomer = {
  name: "Jana Nováková",
  memberId: "BG-00482",
  status: "Členka Beginy",
  initials: "JN",
};

// Pozn.: partnerská sleva už tu NENÍ jako statická položka — počítá se
// dynamicky z partnerTiers/mockMonthlyPurchase přímo v app/page.tsx, aby
// nikdy nemohla odporovat skutečným pravidlům partnerského programu.
export const mockPerks = [
  {
    id: 2,
    title: "Dárek k nákupu nad 990 Kč",
    subtitle: "platí do 15. 10. 2026",
  },
  {
    id: 3,
    title: "Předobjednávka nové příchutě",
    subtitle: "platí do 1. 11. 2026",
  },
];

export const mockLastOrder = {
  date: "2026-09-05",
  summary: "2× Begina Original, 1× Begina Bez cukru",
};

// "Doporučte Beginu" je záměrně mimo quickLinks i bottomNavItems —
// referral program zatím nemá schválená obchodní pravidla, obrazovka
// dashboard/app/doporucit zůstává v kódu, ale bez odkazu z hlavní navigace.

export const quickLinks = [
  { icon: "history", label: "Historie objednávek", href: "/objednavky" },
  { icon: "user", label: "Můj profil", href: "/profil" },
] as const;

export const bottomNavItems = [
  { icon: "home", label: "Domů", href: "/" },
  { icon: "package", label: "Objednávky", href: "/objednavky" },
  { icon: "percent", label: "Program", href: "/partnersky-program" },
  { icon: "user", label: "Profil", href: "/profil" },
] as const;

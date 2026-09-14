// Mock data pro vizuální prototyp dashboardu "Moje Begina".
// Žádné napojení na backend / WooCommerce — jen ukázková data.

export const mockCustomer = {
  name: "Jana Nováková",
  memberId: "BG-00482",
  status: "Členka Beginy",
  initials: "JN",
};

export const mockPerks = [
  {
    id: 1,
    title: "10 % sleva na další objednávku",
    validUntil: "30. 9. 2026",
  },
  {
    id: 2,
    title: "Dárek k nákupu nad 990 Kč",
    validUntil: "15. 10. 2026",
  },
  {
    id: 3,
    title: "Předobjednávka nové příchutě",
    validUntil: "1. 11. 2026",
  },
];

export const mockLastOrder = {
  date: "2026-09-05",
  summary: "2× Begina Original, 1× Begina Bez cukru",
};

export const quickLinks = [
  { icon: "history", label: "Historie objednávek", href: "/historie" },
  { icon: "users", label: "Doporučte Beginu", href: "/doporucit" },
  { icon: "user", label: "Můj profil", href: "/profil" },
] as const;

export const bottomNavItems = [
  { icon: "home", label: "Domů", href: "/" },
  { icon: "package", label: "Objednávky", href: "/historie" },
  { icon: "users", label: "Doporučit", href: "/doporucit" },
  { icon: "user", label: "Profil", href: "/profil" },
] as const;

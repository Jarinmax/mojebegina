// ESHOP 1.0 — navigace z návrhu úvodní stránky (Hero e-shopu Begina.cz,
// 2. 10. 2026): krátké názvy v menu, ikony a popisky pod hero.
// Zobrazí se jen kategorie, které v katalogu (DB) opravdu jsou.

export type HomeCategory = { slug: string; menuLabel: string; stripLabel: string; icon: string };

export const HOME_CATEGORIES: HomeCategory[] = [
  { slug: "polevky", menuLabel: "Polévky", stripLabel: "Čerstvé polévky", icon: "/eshop/hero/ikona-polevky.webp" },
  { slug: "sirupy", menuLabel: "Sirupy", stripLabel: "Bylinné sirupy", icon: "/eshop/hero/ikona-sirupy.webp" },
  { slug: "caje", menuLabel: "Čaje", stripLabel: "Čaje", icon: "/eshop/hero/ikona-caje.webp" },
  { slug: "ovocne-napoje", menuLabel: "Nápoje", stripLabel: "Ovocné nápoje", icon: "/eshop/hero/ikona-ovocne-napoje.webp" },
  { slug: "koktejly", menuLabel: "Koktejly", stripLabel: "Koktejly", icon: "/eshop/hero/ikona-koktejly.webp" },
];

export function availableHomeCategories(slugs: Iterable<string>): HomeCategory[] {
  const present = new Set(slugs);
  return HOME_CATEGORIES.filter((c) => present.has(c.slug));
}

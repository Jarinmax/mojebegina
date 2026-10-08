// ESHOP 1.0 — navigace z návrhu úvodní stránky (Hero e-shopu Begina.cz,
// 2. 10. 2026): krátké názvy v menu, ikony a popisky pod hero.
// Zobrazí se jen kategorie, které v katalogu (DB) opravdu jsou.

// Kategorie bez kreslené ikony (zatím zmrzliny) je v menu, v pruhu ikon pod
// hero ne — doplní se, až vedení dodá ikonu.
export type HomeCategory = { slug: string; menuLabel: string; stripLabel: string; icon: string | null };

export const HOME_CATEGORIES: HomeCategory[] = [
  { slug: "polevky", menuLabel: "Polévky", stripLabel: "Čerstvé polévky", icon: "/eshop/hero/ikona-polevky.webp" },
  { slug: "sirupy", menuLabel: "Sirupy", stripLabel: "Bylinné sirupy", icon: "/eshop/hero/ikona-sirupy.webp" },
  { slug: "caje", menuLabel: "Čaje", stripLabel: "Čaje", icon: "/eshop/hero/ikona-caje.webp" },
  { slug: "ovocne-napoje", menuLabel: "Nápoje", stripLabel: "Ovocné nápoje", icon: "/eshop/hero/ikona-ovocne-napoje.webp" },
  { slug: "koktejly", menuLabel: "Koktejly", stripLabel: "Koktejly", icon: "/eshop/hero/ikona-koktejly.webp" },
  // Rozhodnutí vedení 8. 10. 2026: kategorie viditelná hned, produkty a mražená přeprava později.
  { slug: "zmrzliny", menuLabel: "Zmrzliny", stripLabel: "Zmrzliny", icon: null },
];

export function availableHomeCategories(slugs: Iterable<string>): HomeCategory[] {
  const present = new Set(slugs);
  return HOME_CATEGORIES.filter((c) => present.has(c.slug));
}

/** Pruh ikon pod hero: jen kategorie, které ikonu mají. */
export function stripCategories(categories: HomeCategory[]): (HomeCategory & { icon: string })[] {
  return categories.filter((c): c is HomeCategory & { icon: string } => c.icon !== null);
}

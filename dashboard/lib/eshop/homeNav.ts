// ESHOP 1.0 — navigace úvodní stránky. Úpravy podle zadání Lucie (6. 11. 2026):
// plné názvy kategorií, Čaje / Ovocné nápoje / Alkoholické koktejly pod
// rozbalovací položkou „Nápoje“, Zmrzliny s vlastní ilustrací v pruhu.
// Zobrazí se jen kategorie, které v katalogu (DB) opravdu jsou.

export type HomeCategory = {
  slug: string;
  menuLabel: string;
  stripLabel: string;
  icon: string | null;
  /** "napoje" = položka v rozbalovací nabídce Nápoje, ne samostatně v menu */
  group?: "napoje";
};

export const HOME_CATEGORIES: HomeCategory[] = [
  { slug: "polevky", menuLabel: "Čerstvé polévky", stripLabel: "Čerstvé polévky", icon: "/eshop/hero/ikona-polevky.webp" },
  { slug: "sirupy", menuLabel: "Bylinné sirupy", stripLabel: "Bylinné sirupy", icon: "/eshop/hero/ikona-sirupy.webp" },
  { slug: "caje", menuLabel: "Čaje", stripLabel: "Čaje", icon: "/eshop/hero/ikona-caje.webp", group: "napoje" },
  {
    slug: "ovocne-napoje",
    menuLabel: "Ovocné nápoje",
    stripLabel: "Ovocné nápoje",
    icon: "/eshop/hero/ikona-ovocne-napoje.webp",
    group: "napoje",
  },
  {
    slug: "koktejly",
    menuLabel: "Alkoholické koktejly",
    stripLabel: "Alkoholické koktejly",
    icon: "/eshop/hero/ikona-koktejly.webp",
    group: "napoje",
  },
  { slug: "zmrzliny", menuLabel: "Zmrzliny", stripLabel: "Zmrzliny", icon: "/eshop/hero/ikona-zmrzliny.webp" },
];

export const DRINKS_MENU_LABEL = "Nápoje";

export function availableHomeCategories(slugs: Iterable<string>): HomeCategory[] {
  const present = new Set(slugs);
  return HOME_CATEGORIES.filter((c) => present.has(c.slug));
}

/** Pruh ikon pod hero: jen kategorie, které ikonu mají. */
export function stripCategories(categories: HomeCategory[]): (HomeCategory & { icon: string })[] {
  return categories.filter((c): c is HomeCategory & { icon: string } => c.icon !== null);
}

export type MenuLink = { kind: "link"; href: string; label: string; /** absolutní odkaz mimo e-shop (MojeBegina) */ external?: boolean };
export type MenuGroup = { kind: "group"; label: string; items: MenuLink[] };
export type MenuEntry = MenuLink | MenuGroup;

/** Zákaznická část aplikace (zadání majitele 9. 11. 2026: poslední položka menu). */
export const MOJE_BEGINA_LINK: MenuLink = { kind: "link", href: "https://moje.begina.cz/", label: "MojeBegina", external: true };

/**
 * Horní menu: kategorie v pořadí HOME_CATEGORIES, nápojové kategorie
 * sloučené do jedné rozbalovací položky na místě první z nich, za nimi
 * `extra` (O nás, O vodě, MojeBegina). Bez nápojových kategorií se „Nápoje“ nezobrazí.
 */
export function mainMenu(categories: HomeCategory[], extra: MenuLink[] = []): MenuEntry[] {
  const entries: MenuEntry[] = [];
  let drinks: MenuGroup | null = null;
  for (const c of categories) {
    const link: MenuLink = { kind: "link", href: `/kategorie/${c.slug}`, label: c.menuLabel };
    if (c.group === "napoje") {
      if (!drinks) {
        drinks = { kind: "group", label: DRINKS_MENU_LABEL, items: [] };
        entries.push(drinks);
      }
      drinks.items.push(link);
    } else {
      entries.push(link);
    }
  }
  return [...entries, ...extra];
}

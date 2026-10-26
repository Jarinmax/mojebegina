// ESHOP 1.0 — co ukazuje kolotoč na jednotlivých stránkách e-shopu (jako
// na begina.cz, kde kolotoč běží pod obsahem každé stránky). Čisté funkce
// nad katalogem z DB, testované zvlášť.
import type { Catalog, Category } from "./types";

export type CarouselTile = {
  key: string;
  /** Cesta e-shopu bez /eshop (ShopLink doplní základ podle domény). */
  href: string;
  name: string;
  image: string | null;
  /** category = dlaždice s fotkou kategorie (název přes pruh), product = fotka produktu a název pod ní */
  kind: "category" | "product";
};

export type PageCarouselContent = { label: string; tiles: CarouselTile[] };

/**
 * Nápoje pro stránku O vodě (výběr vedení 3. 10. 2026), v tomto pořadí.
 * „Golden Nepál Ice Tea“ = Černý čaj Golden Nepal (potvrzeno vedením
 * 6. 10. 2026) — hledá se podle názvu v katalogu.
 */
export const WATER_DRINKS = [
  "Červánkové nebe",
  "Dům u jezera",
  "Heřmánkový ledový čaj",
  "Černý čaj Golden Nepal",
] as const;

/** Kategorie s nápoji — náhrada na stránce O vodě, dokud vybrané nápoje nejsou v katalogu. */
const DRINK_CATEGORIES = ["caje", "ovocne-napoje", "sirupy"];

/** Porovnání názvů bez ohledu na velikost písmen a diakritiku. */
function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function categoryTile(category: Pick<Category, "slug" | "name" | "image">): CarouselTile {
  return {
    key: category.slug,
    href: `/kategorie/${category.slug}`,
    name: category.name,
    image: category.image,
    kind: "category",
  };
}

/** Výchozí kolotoč: kategorie s fotkou (volitelně bez té, na jejíž stránce právě jsme). */
export function categoryCarousel(catalog: Catalog, exceptSlug?: string): PageCarouselContent {
  return {
    label: "Naše produkty",
    tiles: catalog.categories.filter((c) => c.image && c.slug !== exceptSlug).map(categoryTile),
  };
}

/**
 * Stránka O vodě: vybrané nápoje (hledané v katalogu podle názvu). Nápoj,
 * který v katalogu ještě není, se vynechá; nejsou-li tam žádné, ukáže se
 * zatím kolotoč kategorií s nápoji.
 */
export function waterCarousel(catalog: Catalog): PageCarouselContent {
  const byName = new Map(catalog.products.map((p) => [normalizeName(p.name), p]));
  const tiles = WATER_DRINKS.flatMap((name) => {
    const product = byName.get(normalizeName(name));
    return product
      ? [{ key: product.slug, href: `/produkt/${product.slug}`, name: product.name, image: product.image, kind: "product" as const }]
      : [];
  });
  if (tiles.length > 0) return { label: "Nápoje", tiles };
  return {
    label: "Nápoje",
    tiles: catalog.categories.filter((c) => c.image && DRINK_CATEGORIES.includes(c.slug)).map(categoryTile),
  };
}

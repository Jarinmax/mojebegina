// Produkty z WordPressu (begina.cz/produkt/<slug>/), které v katalogu nového
// e-shopu zatím nejsou vidět (skryté do ověření alergenů — docs/eshop-catalog
// 7x_ovocne_napoje*). Stará adresa nesmí skončit chybou: dočasně (307, ne 301
// — po zveřejnění bude produkt na stejné adrese) vede na jeho kategorii,
// kde je „Připravujeme“, nebo na úvod, kdyby kategorie chyběla.
import type { CatalogIndex } from "./catalogIndex";

export const HIDDEN_LEGACY_PRODUCTS: Readonly<Record<string, string>> = {
  "cervankove-nebe": "ovocne-napoje",
  "dum-u-jezera": "ovocne-napoje",
  "malinovy-svarak-nealko": "ovocne-napoje",
};

/** Cesta e-shopu, kam dočasně vést starou adresu produktu; null = není to produkt z WordPressu. */
export function legacyProductFallback(slug: string, index: Pick<CatalogIndex, "findCategory">): string | null {
  const category = HIDDEN_LEGACY_PRODUCTS[slug];
  if (category === undefined) return null;
  return index.findCategory(category) ? `/kategorie/${category}` : "/";
}

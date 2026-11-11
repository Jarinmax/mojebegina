// Úložiště etiket (11. 11. 2026) — kategorie a podskupiny.
// Soubory leží v public/etikety/<kategorie>/[<podskupina>/]*.png|pdf|jpg.
// Seznam souborů generuje scripts/etikety/build-manifest.mjs do manifest.ts.
export type EtiketyGroup = { slug: string; label: string };
export type EtiketyCategory = { slug: string; label: string; groups?: EtiketyGroup[] };

export const ETIKETY_CATEGORIES: EtiketyCategory[] = [
  { slug: "polevky", label: "Polévky (3 l)" },
  {
    slug: "sirupy",
    label: "Sirupy",
    groups: [
      { slug: "3l", label: "3 l" },
      { slug: "650ml", label: "650 ml" },
      { slug: "100ml", label: "100 ml" },
    ],
  },
  { slug: "ovocne-napoje", label: "Ovocné nápoje (3 l)" },
  {
    slug: "alkoholicke-koktejly",
    label: "Alkoholické koktejly",
    groups: [
      { slug: "3l", label: "3 l" },
      { slug: "500ml", label: "500 ml" },
    ],
  },
  { slug: "caje", label: "Čaje (3 l)" },
];

/** Klíč pro manifest: "polevky" nebo "sirupy/3l". */
export function folderKeys(): string[] {
  return ETIKETY_CATEGORIES.flatMap((c) => (c.groups ? c.groups.map((g) => `${c.slug}/${g.slug}`) : [c.slug]));
}

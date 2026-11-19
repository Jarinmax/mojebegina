// Fotky na e-shop (11. 11. 2026) — finální produktové fotky, kategorie a skupiny.
// Soubory leží v public/fotky-eshop/<kategorie>/<skupina>/<produkt>.jpg|png.
// Seznam souborů generuje scripts/fotky-eshop/build-manifest.mjs do manifest.ts.
import { ETIKETY_NAMES } from "@/lib/etikety/structure";

export type FotkyGroup = { slug: string; label: string };
export type FotkyCategory = { slug: string; label: string; groups: FotkyGroup[] };

const HLAVNI: FotkyGroup = { slug: "hlavni", label: "Hlavní fotka" };
const BEGINA: FotkyGroup = { slug: "begina-3l", label: "S beginou 3 l" };

export const FOTKY_CATEGORIES: FotkyCategory[] = [
  {
    slug: "logo",
    label: "Logo a sociální sítě",
    groups: [
      { slug: "logo", label: "Logo Begina (originál 5906 × 5906 px)" },
      { slug: "profilovka", label: "Profilovka Facebook / Instagram" },
      { slug: "facebook-uvodni", label: "Úvodní fotka Facebooku" },
    ],
  },
  {
    slug: "uvodni-fotka",
    label: "Úvodní fotka",
    groups: [
      { slug: "aktualni", label: "Aktuální úvodní fotka webu" },
      { slug: "tisk", label: "Předchozí úvodní fotka – pro tisk (5400 × 4200 px)" },
    ],
  },
  { slug: "o-nas", label: "O nás", groups: [{ slug: "fotka", label: "Fotka Jarina a Lucie (stránka O nás)" }] },
  { slug: "ikonky", label: "Ikonky", groups: [{ slug: "kategorie", label: "Ikonky kategorií na úvodní stránce" }] },
  { slug: "polevky", label: "Polévky", groups: [HLAVNI, BEGINA] },
  {
    slug: "sirupy",
    label: "Sirupy",
    groups: [
      HLAVNI,
      BEGINA,
      { slug: "sacek-650ml", label: "Se stříbrným sáčkem 650 ml" },
      { slug: "set", label: "Ochutnávkový set sirupů" },
    ],
  },
  { slug: "ovocne-napoje", label: "Ovocné nápoje", groups: [HLAVNI, BEGINA] },
  {
    slug: "alkoholicke-koktejly",
    label: "Alkoholické koktejly",
    groups: [HLAVNI, BEGINA, { slug: "sacek-500ml", label: "S průhledným sáčkem 500 ml" }],
  },
  { slug: "caje", label: "Čaje", groups: [HLAVNI, BEGINA] },
];

/** Klíč pro manifest: "sirupy/hlavni". */
export function fotkyFolderKeys(): string[] {
  return FOTKY_CATEGORIES.flatMap((c) => c.groups.map((g) => `${c.slug}/${g.slug}`));
}

const EXTRA_NAMES: Record<string, string> = {
  "uvodni-fotka": "Úvodní fotka",
  "uvodni-fotka-tisk": "Úvodní fotka – pro tisk",
  "jarin-a-lucie": "Jarin a Lucie (na webu, čtverec)",
  "jarin-a-lucie-original": "Jarin a Lucie (originál)",
  "ochutnavkovy-set-sirupu": "Ochutnávkový set sirupů",
  "logo-begina": "Logo Begina",
  "profilovka-facebook-instagram": "Profilovka (FB / IG)",
  "facebook-uvodni-fotka": "Úvodní fotka Facebooku",
  "ikona-polevky": "Čerstvé polévky",
  "ikona-sirupy": "Bylinné sirupy",
  "ikona-caje": "Čaje",
  "ikona-ovocne-napoje": "Ovocné nápoje",
  "ikona-koktejly": "Alkoholické koktejly",
  "ikona-zmrzliny": "Zmrzliny",
};

/** Hezký název produktu podle názvu souboru (bez přípony). */
export function fotkyDisplayName(file: string): string {
  const key = file.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
  if (key === "rajcatova-polevka") return "Tomatová polévka";
  if (EXTRA_NAMES[key]) return EXTRA_NAMES[key];
  if (ETIKETY_NAMES[key]) return ETIKETY_NAMES[key];
  return key.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

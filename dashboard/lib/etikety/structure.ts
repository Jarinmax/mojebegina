// Úložiště etiket (11. 11. 2026) — kategorie a podskupiny.
// Soubory leží v public/etikety/<kategorie>/[<podskupina>/]*.png|pdf|jpg.
// Seznam souborů generuje scripts/etikety/build-manifest.mjs do manifest.ts.
export type EtiketyGroup = { slug: string; label: string };
export type EtiketyCategory = { slug: string; label: string; groups?: EtiketyGroup[] };

export const ETIKETY_CATEGORIES: EtiketyCategory[] = [
  {
    slug: "polevky",
    label: "Polévky (3 l)",
    groups: [
      { slug: "slozeni", label: "Složení" },
      { slug: "predni-barevne", label: "Přední – barevné" },
      { slug: "predni-cervenocerne", label: "Přední – Brother červeno-černé (DK-22251)" },
      { slug: "predni-cernobile", label: "Přední – Brother černobílé (DK-22212)" },
    ],
  },
  {
    slug: "sirupy",
    label: "Sirupy",
    groups: [
      { slug: "3l", label: "3 l" },
      { slug: "650ml", label: "650 ml" },
      { slug: "100ml", label: "100 ml" },
      { slug: "predni-barevne-3l", label: "Přední – barevné 3 l" },
      { slug: "predni-barevne-650ml", label: "Přední – barevné 650 ml" },
      { slug: "predni-cervenocerne-3l", label: "Přední – Brother červeno-černé 3 l (DK-22251)" },
      { slug: "predni-cervenocerne-650ml", label: "Přední – Brother červeno-černé 650 ml (DK-22251)" },
      { slug: "predni-cernobile-3l", label: "Přední – Brother černobílé 3 l (DK-22212)" },
      { slug: "predni-cernobile-650ml", label: "Přední – Brother černobílé 650 ml (DK-22212)" },
      { slug: "ochutnavkovy-set", label: "Ochutnávkový set – krabice (DK-22251)" },
    ],
  },
  {
    slug: "ovocne-napoje",
    label: "Ovocné nápoje (3 l)",
    groups: [
      { slug: "slozeni", label: "Složení" },
      { slug: "predni-barevne", label: "Přední – barevné" },
      { slug: "predni-cervenocerne", label: "Přední – Brother červeno-černé (DK-22251)" },
      { slug: "predni-cernobile", label: "Přední – Brother černobílé (DK-22212)" },
    ],
  },
  {
    slug: "alkoholicke-koktejly",
    label: "Alkoholické koktejly",
    groups: [
      { slug: "3l", label: "3 l" },
      { slug: "500ml", label: "500 ml" },
      { slug: "predni-barevne-3l", label: "Přední – barevné 3 l" },
      { slug: "predni-barevne-500ml", label: "Přední – barevné 500 ml" },
      { slug: "predni-cervenocerne-3l", label: "Přední – Brother červeno-černé 3 l (DK-22251)" },
      { slug: "predni-cervenocerne-500ml", label: "Přední – Brother červeno-černé 500 ml (DK-22251)" },
      { slug: "predni-cernobile-3l", label: "Přední – Brother černobílé 3 l (DK-22212)" },
      { slug: "predni-cernobile-500ml", label: "Přední – Brother černobílé 500 ml (DK-22212)" },
    ],
  },
  {
    slug: "caje",
    label: "Čaje (3 l)",
    groups: [
      { slug: "slozeni", label: "Složení" },
      { slug: "predni-barevne", label: "Přední – barevné" },
      { slug: "predni-cervenocerne", label: "Přední – Brother červeno-černé (DK-22251)" },
      { slug: "predni-cernobile", label: "Přední – Brother černobílé (DK-22212)" },
    ],
  },
  {
    slug: "sk-polevky",
    label: "🇸🇰 SK – Polievky (3 l)",
    groups: [
      { slug: "slozeni", label: "Zloženie (zadné)" },
      { slug: "predni-barevne", label: "Predné – farebné" },
      { slug: "predni-cervenocerne", label: "Predné – Brother červeno-čierne (DK-22251)" },
      { slug: "predni-cernobile", label: "Predné – Brother čiernobiele (DK-22212)" },
    ],
  },
  {
    slug: "sk-sirupy",
    label: "🇸🇰 SK – Sirupy",
    groups: [
      { slug: "3l", label: "Zloženie 3 l" },
      { slug: "650ml", label: "Zloženie 650 ml" },
      { slug: "100ml", label: "Zloženie 100 ml" },
      { slug: "predni-barevne-3l", label: "Predné – farebné 3 l" },
      { slug: "predni-barevne-650ml", label: "Predné – farebné 650 ml" },
      { slug: "predni-cervenocerne-3l", label: "Predné – Brother červeno-čierne 3 l (DK-22251)" },
      { slug: "predni-cervenocerne-650ml", label: "Predné – Brother červeno-čierne 650 ml (DK-22251)" },
      { slug: "predni-cernobile-3l", label: "Predné – Brother čiernobiele 3 l (DK-22212)" },
      { slug: "predni-cernobile-650ml", label: "Predné – Brother čiernobiele 650 ml (DK-22212)" },
    ],
  },
  {
    slug: "sk-ovocne-napoje",
    label: "🇸🇰 SK – Ovocné nápoje (3 l)",
    groups: [
      { slug: "slozeni", label: "Zloženie (zadné)" },
      { slug: "predni-barevne", label: "Predné – farebné" },
      { slug: "predni-cervenocerne", label: "Predné – Brother červeno-čierne (DK-22251)" },
      { slug: "predni-cernobile", label: "Predné – Brother čiernobiele (DK-22212)" },
    ],
  },
  {
    slug: "sk-caje",
    label: "🇸🇰 SK – Čaje (3 l)",
    groups: [
      { slug: "slozeni", label: "Zloženie (zadné)" },
      { slug: "predni-barevne", label: "Predné – farebné" },
      { slug: "predni-cervenocerne", label: "Predné – Brother červeno-čierne (DK-22251)" },
      { slug: "predni-cernobile", label: "Predné – Brother čiernobiele (DK-22212)" },
    ],
  },
];

/** Klíč pro manifest: "polevky" nebo "sirupy/3l". */
export function folderKeys(): string[] {
  return ETIKETY_CATEGORIES.flatMap((c) => (c.groups ? c.groups.map((g) => `${c.slug}/${g.slug}`) : [c.slug]));
}

/** Hezké názvy pro soubory (klíč = název souboru bez přípony, malými písmeny). */
export const ETIKETY_NAMES: Record<string, string> = {
  "dynova-polevka": "Dýňová polévka",
  "gulasova-polevka-z-hlivy-ustricne": "Gulášová polévka z hlívy ústřičné",
  kulajda: "Kulajda",
  "rajcatova-polevka-s-cervenou-repou": "Rajčatová polévka s červenou řepou",
  "spenatova-polevka": "Špenátová polévka",
  "tomatova-polevka": "Tomatová polévka",
  "bylinny-sirup-saman": "Bylinný sirup Šaman",
  "hermankovy-sirup": "Heřmánkový sirup",
  "ibiskovy-sirup": "Ibiškový sirup",
  "lipovy-sirup": "Lipový sirup",
  "medunkovy-sirup-s-levanduli": "Meduňkový sirup s levandulí",
  "sipkovy-sirup": "Šípkový sirup",
  "zazvorovy-sirup": "Zázvorový sirup",
  "dum-u-jezera": "Dům u jezera",
  "cervankove-nebe": "Červánkové nebe",
  "malinovy-svarak-nealko": "Malinový svařák – nealko",
  "granatovy-bond": "Granátový Bond",
  kosmopolitan: "Kosmopolitan",
  "lady-carneval": "Lady Carneval",
  "svarak-deluxe": "Svařák Deluxe",
  "bylinny-caj-saman": "Bylinný čaj Šaman",
  "cerny-caj-golden-nepal": "Černý čaj Golden Nepal",
  "hermankovy-caj": "Heřmánkový čaj",
  "ibiskovy-caj": "Ibiškový čaj",
  "jasminovy-zeleny-caj": "Jasmínový zelený čaj",
  "lipovy-caj": "Lipový čaj",
  "medunkovy-caj-s-levanduli": "Meduňkový čaj s levandulí",
  "zazvorovy-caj": "Zázvorový čaj",
};

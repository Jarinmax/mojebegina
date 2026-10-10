// ESHOP 1.0 — informační stránky (O nás, O vodě, Doprava, Obchodní
// podmínky, Ochrana osobních údajů). JEDINÉ místo, kde jsou jejich texty
// a adresy; menu, patička i stránky se berou odsud.
//
// `blocks: null` = text zatím nemáme → stránka existuje, odkaz funguje
// a zobrazí se „Text připravujeme“ s kontaktem na provozovatele.
// Právní texty se NEvymýšlejí — dodává je vedení (obchodní podmínky dodány
// 3. 10. 2026, GDPR 8. 10. 2026).
import { formatKc } from "@/lib/format";
import { TRANSFER_DUE_DAYS } from "./bankTransfer";
import { shippingMethods } from "./shipping";
import { TERMS_BLOCKS, TERMS_EFFECTIVE } from "./content/obchodniPodminky";
import { PRIVACY_BLOCKS, PRIVACY_EFFECTIVE } from "./content/ochranaOsobnichUdaju";

/** Číslovaný bod (např. článek obchodních podmínek): text, případně řádky adresy, odrážky a pokračování. */
export type InfoPoint = { text: string; lines?: string[]; items?: string[]; after?: string };

export type InfoBlock = {
  heading?: string;
  /** podnadpis uvnitř článku (např. „1. Vyřízení objednávky…“) */
  subheading?: string;
  paragraphs?: string[];
  /** řádky adresy v rámečku (první tučně), za odstavci */
  lines?: string[];
  items?: string[];
  /** "check" = odrážky ✔ (jako na begina.cz), jinak tečky */
  itemStyle?: "check";
  points?: InfoPoint[];
  /** odstavce za odrážkami / adresou */
  afterParagraphs?: string[];
};

export type InfoPage = {
  /** Cesta e-shopu bez /eshop („/o-nas“) — odkaz přes ShopLink / eshopHref. */
  path: string;
  footerLabel: string;
  title: string;
  /** Řádek pod nadpisem, např. „Platné a účinné od …“. */
  subtitle?: string;
  description: string;
  /** null = text připravujeme */
  blocks: InfoBlock[] | null;
  /** Upozornění, že část textu ještě chybí (stránka už ale obsah má). */
  pendingNote?: string;
};

/** Údaje provozovatele (převzaté ze stávající patičky begina.cz). */
export const OPERATOR = {
  name: "Jaroslav Viner",
  phone: "+420 774 199 975",
  phoneHref: "tel:+420774199975",
  email: "info@begina.cz",
  address: "Mostecká 273/21, 118 00 Praha 1",
  ico: "74337297",
} as const;

// Texty z begina.cz (doslova) pro úvodní stránku e-shopu.
export const whyBegina = [
  "pečlivý výběr kvalitních surovin",
  "promyšlené kombinace chutí",
  "důraz na vyváženost receptur",
  "poctivá česká výroba",
];

export const filteredWater = [
  "je základem každé naší receptury",
  "nechává vyniknout přirozenou chuť surovin",
  "pomáhá zachovat čistý a vyvážený chuťový profil",
];

// Text stránky O nás z begina.cz (www.begina.cz/o-nas/), dodaný vedením
// 4. 10. 2026 jako snímky obrazovky; přepsaný doslova v pořadí na stránce.
const aboutPage: InfoPage = {
  path: "/o-nas",
  footerLabel: "O nás",
  title: "O nás",
  description: "Begina — čerstvé polévky, sirupy a nápoje z čisté filtrované vody v praktickém balení.",
  blocks: [
    {
      paragraphs: [
        "Chuť je pro mě základ.",
        "Gastronomii se věnuji dlouhodobě, ale v roce 2018 jsem si začal víc všímat rozdílu mezi tím, kdy se jídlo jen připravuje, a kdy se skutečně tvoří s důrazem na kvalitu a chuť.",
        "Hledal jsem způsob, jak ji zachovat i v čase.",
        "Tehdy jsem narazil na Bag-in-Box systém, který dokáže chránit obsah bez přístupu vzduchu.",
        "V roce 2023 jsem potkal Lucii a začali jsme tvořit společně.",
        "V Českém Krumlově jsme otevřeli Simon Gallery. Právě tam vznikly první čaje a nápoje z čisté filtrované vody – jednoduché, poctivé a postavené na chuti.",
        "Po návratu do Prahy jsme na tomhle základu postavili značku Begina.",
        "Produkty připravuji z čisté filtrované vody a používám systém, který zachovává jejich chuť i při postupném používání.",
        "Begina stojí na jedné věci –",
        "že když něco chutná dobře, poznáš to hned.",
      ],
    },
    {
      paragraphs: ["Čerstvé polévky, sirupy a nápoje z čisté filtrované vody v praktickém balení pro každodenní použití."],
    },
    {
      paragraphs: [
        "Naše beginy připravujeme z čisté filtrované vody a plníme je do Bag-in-Box balení o objemu 3 litry.",
        "Kromě toho nabízíme i další varianty balení podle typu produktu.",
        "Použitý systém chrání obsah a umožňuje jeho postupnou spotřebu.",
      ],
      itemStyle: "check",
      items: [
        "profesionální příprava",
        "praktické bag-in-box balení s kohoutkem",
        "ochrana obsahu bez přístupu vzduchu",
        "bez lepku",
      ],
    },
    {
      paragraphs: ["Jednoduchý způsob, jak mít čerstvou polévku nebo nápoj vždy po ruce."],
    },
  ],
};

// Text stránky O vodě z begina.cz (www.begina.cz/o-vode/), dodaný vedením
// 3. 10. 2026 jako snímek obrazovky; přepsaný doslova (nadpisy jako na webu).
const waterPage: InfoPage = {
  path: "/o-vode",
  footerLabel: "O vodě",
  title: "Voda je základ",
  description: "Proč Begina používá čistou filtrovanou vodu.",
  blocks: [
    {
      paragraphs: [
        "Voda je nezbytnou součástí života.",
        "Pokrývá přibližně 71 % povrchu Země a tvoří významnou část lidského těla.",
        "Podílí se na transportu živin, odvádění odpadních látek a regulaci tělesné teploty. Současně je důležitá pro hydrataci buněk, trávení a vstřebávání živin.",
        "Dostatečný příjem tekutin je součástí zdravého životního stylu.",
      ],
    },
    {
      heading: "Kvalita vody je pro nás důležitá",
      paragraphs: [
        "Voda tvoří převážnou část našich nápojů, a proto její kvalitě věnujeme mimořádnou pozornost. Používáme čistou filtrovanou vodu, která nám umožňuje dosahovat stabilní chuti a konzistentní kvality napříč celou výrobou.",
        "Díky důkladné filtraci pracujeme s vodou, jejíž složení máme pod kontrolou. To nám umožňuje zachovat charakter jednotlivých receptur a nechat vyniknout chuť použitých surovin.",
      ],
    },
  ],
};

const shippingPage: InfoPage = {
  path: "/doprava",
  footerLabel: "Doprava",
  title: "Doprava a platba",
  description: "Způsoby doručení a platby v e-shopu Begina.",
  // Generováno ze stejných dat, ze kterých počítá pokladna (shipping.ts).
  blocks: [
    {
      heading: "Doručení",
      items: shippingMethods.map(
        (method) => `${method.label} — ${method.priceKc === 0 ? "zdarma" : formatKc(method.priceKc)}. ${method.description}`
      ),
    },
    {
      heading: "Platba",
      items: [
        `Bankovní převod předem — po objednávce vám pošleme platební údaje a QR kód pro QR Platbu. Splatnost je ${TRANSFER_DUE_DAYS} dní, objednávku vyřídíme po připsání platby.`,
        "Kartou online — platební karta, Apple Pay nebo Google Pay, zabezpečeně přes Stripe.",
      ],
    },
  ],
  pendingNote: "Ceník chlazené přepravy podle objemu objednávky, rozvozové dny a oblasti doplníme.",
};

// Text dodaný vedením 3. 10. 2026: lib/eshop/content/obchodniPodminky.ts.
const termsPage: InfoPage = {
  path: "/obchodni-podminky",
  footerLabel: "Obchodní podmínky",
  title: "Obchodní podmínky e-shopu Begina.cz",
  subtitle: `Platné a účinné od ${TERMS_EFFECTIVE}`,
  description: "Obchodní podmínky e-shopu Begina.cz.",
  blocks: TERMS_BLOCKS,
};

const privacyPage: InfoPage = {
  path: "/ochrana-osobnich-udaju",
  footerLabel: "GDPR",
  title: "Ochrana osobních údajů (GDPR)",
  subtitle: `Platné a účinné od ${PRIVACY_EFFECTIVE}`,
  description: "Zásady zpracování osobních údajů v e-shopu Begina.",
  // Text dodaný vedením 8. 10. 2026: lib/eshop/content/ochranaOsobnichUdaju.ts.
  blocks: PRIVACY_BLOCKS,
};

export const INFO_PAGES = {
  about: aboutPage,
  water: waterPage,
  shipping: shippingPage,
  terms: termsPage,
  privacy: privacyPage,
} as const;

/** Pořadí odkazů v patičce. */
export const FOOTER_LINKS: InfoPage[] = [aboutPage, shippingPage, termsPage, privacyPage];

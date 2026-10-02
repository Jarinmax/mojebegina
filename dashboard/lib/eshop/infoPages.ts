// ESHOP 1.0 — informační stránky z patičky (O nás, Doprava, Obchodní
// podmínky, Ochrana osobních údajů). JEDINÉ místo, kde jsou jejich texty
// a adresy; patička i stránky se berou odsud.
//
// `blocks: null` = text zatím nemáme → stránka existuje, odkaz funguje
// a zobrazí se „Text připravujeme“ s kontaktem na provozovatele.
// Právní texty (obchodní podmínky, GDPR) se NEvymýšlejí — doplní je vedení.
import { formatKc } from "@/lib/format";
import { TRANSFER_DUE_DAYS } from "./bankTransfer";
import { shippingMethods } from "./shipping";

export type InfoBlock = { heading?: string; paragraphs?: string[]; items?: string[] };

export type InfoPage = {
  path: string;
  footerLabel: string;
  title: string;
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

// Texty z begina.cz (doslova), sdílené s úvodní stránkou e-shopu.
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

const aboutPage: InfoPage = {
  path: "/eshop/o-nas",
  footerLabel: "O nás",
  title: "O nás",
  description: "Begina — čerstvé polévky, bylinné sirupy, čaje, ovocné nápoje a alkoholické koktejly.",
  blocks: [
    {
      paragraphs: [
        "Čerstvé polévky, bylinné sirupy, čaje, ovocné nápoje i alkoholické koktejly z pečlivě vybraných surovin a čisté filtrované vody.",
        "Všechny produkty doručujeme chlazenou přepravou.",
      ],
    },
    { heading: "Proč Begina", items: whyBegina },
    { heading: "Čistá filtrovaná voda", items: filteredWater },
  ],
  pendingNote: "Podrobnější představení Beginy doplníme.",
};

const shippingPage: InfoPage = {
  path: "/eshop/doprava",
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

const termsPage: InfoPage = {
  path: "/eshop/obchodni-podminky",
  footerLabel: "Obchodní podmínky",
  title: "Obchodní podmínky",
  description: "Obchodní podmínky e-shopu Begina.",
  blocks: null,
};

const privacyPage: InfoPage = {
  path: "/eshop/ochrana-osobnich-udaju",
  footerLabel: "GDPR",
  title: "Ochrana osobních údajů (GDPR)",
  description: "Zásady zpracování osobních údajů v e-shopu Begina.",
  blocks: null,
};

export const INFO_PAGES = {
  about: aboutPage,
  shipping: shippingPage,
  terms: termsPage,
  privacy: privacyPage,
} as const;

/** Pořadí odkazů v patičce. */
export const FOOTER_LINKS: InfoPage[] = [aboutPage, shippingPage, termsPage, privacyPage];

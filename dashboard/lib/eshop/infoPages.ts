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
import { shippingMethodsFor, type ShippingMode } from "./shipping";
import { COLD_SHIPPING_MAX_GRAMS, COLD_SHIPPING_RULES } from "./shippingRates";
import { OPERATOR } from "./operator";
import { PACKAGING_PAGE_PATH } from "./packaging";
import { CURRENT_TERMS, termsPdfPath } from "./content/termsVersions";
import { WITHDRAWAL_FORM_DOWNLOAD_LABEL, WITHDRAWAL_FORM_PDF_PATH } from "./content/withdrawalForm";
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
  /** Soubor ke stažení pod nadpisem (cesta e-shopu bez /eshop). */
  download?: { path: string; label: string };
  /** Další soubor ke stažení (např. samostatný formulář pro odstoupení). */
  secondaryDownload?: { path: string; label: string };
  /** true = bez řádku „Provozovatel: …“ pod obsahem (údaje jsou v patičce) */
  hideOperatorLine?: boolean;
};

export { OPERATOR };

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

// Text stránky O nás (dodaný 9. 11. 2026, nahrazuje text ze starého webu).
const aboutPage: InfoPage = {
  path: "/o-nas",
  footerLabel: "O nás",
  title: "O nás",
  description: "Za Beginou stojí Jarin a Lucie — čerstvé polévky, bylinné sirupy, čaje, ovocné nápoje, alkoholické koktejly a zmrzliny.",
  hideOperatorLine: true,
  blocks: [
    {
      paragraphs: [
        "Za Beginou stojíme my dva – Jarin a Lucie. Spojuje nás chuť vytvářet něco vlastního a nabídnout Vám dobré jídlo a nápoje pro každý den. Receptury a kombinace chutí vznikají v Jarinově kuchyni, o Beginu a její rozvoj se staráme společně.",
        "V roce 2023 jsme začali tvořit společně. V Českém Krumlově jsme otevřeli Simon Gallery, kde vznikaly naše první čaje a ovocné nápoje z čisté filtrované vody. Na tuto zkušenost jsme později navázali značkou Begina.",
        "Dnes v naší nabídce najdete čerstvé polévky, bylinné sirupy, čaje, ovocné nápoje, alkoholické koktejly a zmrzliny.",
        "Chceme Vám usnadnit každodenní přípravu i chvíle, kdy se u stolu sejde více lidí. Polévku stačí ohřát, sirup naředit a nápoj podávat.",
        "Begina. Když rozhoduje chuť.",
      ],
    },
  ],
};

// Text stránky O vodě (dodaný 9. 11. 2026, nahrazuje text ze starého webu).
const waterPage: InfoPage = {
  path: "/o-vode",
  footerLabel: "O vodě",
  title: "Čistá filtrovaná voda",
  description: "Proč Begina používá čistou filtrovanou vodu.",
  hideOperatorLine: true,
  blocks: [
    {
      paragraphs: [
        "Při přípravě našich polévek, sirupů a nápojů používáme čistou filtrovanou vodu. Je pro nás stejně důležitou součástí receptury jako zelenina, ovoce, bylinky a koření.",
        "Záleží nám na výsledné chuti i pečlivém výběru surovin. Proto věnujeme pozornost také vodě, kterou při výrobě používáme.",
      ],
    },
  ],
};

// Stránka O balení (text dodaný 9. 11. 2026). Třílitrové balení s kohoutkem
// se jmenuje Begina (nikoli „bagina“).
const packagingPage: InfoPage = {
  path: PACKAGING_PAGE_PATH,
  footerLabel: "O balení",
  title: "O balení",
  description: "Třílitrové balení Begina s kohoutkem a menší balení 700 ml a 500 ml.",
  hideOperatorLine: true,
  blocks: [
    {
      paragraphs: [
        "Našemu třílitrovému balení s kohoutkem říkáme Begina. Polévku, sirup nebo nápoj si z něj snadno odčepujete podle potřeby a zbytek necháte na příště.",
      ],
    },
    {
      heading: "Snadné dávkování",
      paragraphs: [
        "Kohoutek umožňuje pohodlné dávkování po porcích. Sáček se při čepování postupně stahuje a omezuje kontakt obsahu se vzduchem. Tím pomáhá chránit chuť i kvalitu výrobku během jeho postupné spotřeby.",
      ],
    },
    {
      heading: "Třílitrové balení",
      paragraphs: [
        "Polévky a ostatní nápoje dodáváme bez vnější krabice. Třílitrové sirupy dodáváme v kartonové krabici s otvorem pro kohoutek.",
      ],
    },
    {
      heading: "Menší balení",
      paragraphs: [
        "Sirupy nabízíme také v balení 700 ml ve stříbrném sáčku se šroubovacím uzávěrem.",
        "Alkoholické nápoje nabízíme také v balení 500 ml v průhledném sáčku se šroubovacím uzávěrem.",
        "Dostupné velikosti najdete vždy u konkrétního produktu.",
      ],
    },
    {
      heading: "Skladování a spotřeba",
      paragraphs: [
        "Podmínky skladování a dobu spotřeby před otevřením i po otevření najdete u konkrétního výrobku a na jeho obalu.",
      ],
    },
  ],
};

const kgText = (kg: number) => kg.toLocaleString("cs-CZ");

/** Stránka Doprava a platba — ze stejných dat, ze kterých počítá pokladna (shipping.ts, shippingRates.ts). */
export function shippingPageFor(mode: ShippingMode): InfoPage {
  const methods = shippingMethodsFor(mode);
  const byWeight = mode === "weight";
  return {
    path: "/doprava",
    footerLabel: "Doprava",
    title: "Doprava a platba",
    description: "Způsoby doručení a platby v e-shopu Begina.",
    blocks: [
      {
        heading: "Doručení",
        items: methods.map((method) =>
          byWeight && method.id === "rozvoz"
            ? `${method.label} — ${method.description}`
            : `${method.label} — ${method.priceKc === 0 ? "zdarma" : formatKc(method.priceKc)}. ${method.description}`
        ),
      },
      ...(byWeight
        ? [
            {
              heading: "Ceník chlazené přepravy",
              paragraphs: ["Cena podle celkové hmotnosti objednávky:"],
              items: COLD_SHIPPING_RULES.map(
                (rule) => `${kgText(rule.fromKg)}–${kgText(rule.toKg)} kg — ${formatKc(rule.priceKc)}`
              ),
              afterParagraphs: [
                `Objednávky nad ${kgText(COLD_SHIPPING_MAX_GRAMS / 1000)} kg a objednávky s položkou bez uvedené hmotnosti nejde chlazenou přepravou objednat automaticky — dopravu domluvíme individuálně: ${OPERATOR.email}, ${OPERATOR.phone}.`,
                "Doručujeme jen v České republice.",
              ],
            },
          ]
        : []),
      {
        heading: "Platba",
        items: [
          `Bankovní převod předem — po objednávce vám pošleme platební údaje a QR kód pro QR Platbu. Splatnost je ${TRANSFER_DUE_DAYS} dní, objednávku vyřídíme po připsání platby.`,
          "Kartou online — platební karta, Apple Pay nebo Google Pay, zabezpečeně přes Stripe.",
        ],
      },
    ],
    pendingNote: byWeight
      ? "Rozvozové dny a lhůty doručení doplníme."
      : "Ceník chlazené přepravy podle objemu objednávky, rozvozové dny a oblasti doplníme.",
  };
}

const shippingPage: InfoPage = shippingPageFor("flat");

// Text dodaný vedením 3. 10. 2026: lib/eshop/content/obchodniPodminky.ts.
const termsPage: InfoPage = {
  path: "/obchodni-podminky",
  footerLabel: "Obchodní podmínky",
  title: "Obchodní podmínky e-shopu Begina.cz",
  subtitle: `Platné a účinné od ${CURRENT_TERMS.effectiveLabel}`,
  description: "Obchodní podmínky e-shopu Begina.cz.",
  // Platné znění (lib/eshop/content/termsVersions.ts); starší znění zůstávají ke stažení.
  blocks: CURRENT_TERMS.blocks,
  download: {
    path: termsPdfPath(CURRENT_TERMS),
    label: CURRENT_TERMS.withWithdrawalForm
      ? "Stáhnout obchodní podmínky včetně formuláře pro odstoupení (PDF)"
      : "Stáhnout obchodní podmínky (PDF)",
  },
  // Samostatný formulář k tisku — jen u znění, které ho má (od 3. vydání).
  ...(CURRENT_TERMS.edition >= 3
    ? { secondaryDownload: { path: WITHDRAWAL_FORM_PDF_PATH, label: WITHDRAWAL_FORM_DOWNLOAD_LABEL } }
    : {}),
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
  packaging: packagingPage,
  shipping: shippingPage,
  terms: termsPage,
  privacy: privacyPage,
} as const;

/** Pořadí odkazů v patičce. */
export const FOOTER_LINKS: InfoPage[] = [aboutPage, shippingPage, termsPage, privacyPage];

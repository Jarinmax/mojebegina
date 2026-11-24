// Stránka „Časté otázky“ (begina.cz/caste-otazky) — zadání Lucie 20. 11. 2026:
// zákaznice nás našla přes ChatGPT, chceme to posílit. Otázky tak, jak se lidé
// ptají vyhledávačů a AI; odpovědi JEN z údajů, které už na webu jsou
// (cafePage.ts, homeContent.ts, stránka Doprava, katalog: polévky 3 l za 379 Kč,
// 12 porcí, po otevření 14 dní). Žádná zdravotní tvrzení, vykání.
// Ze stejných dat se skládá i FAQPage JSON-LD (seo.ts → faqJsonLd).
import { CAFE_PATH } from "./cafePage";
import type { InfoPage } from "./infoPages";
// Slovensko jen když je doručení zapnuté (od 18. 11. 2026 vypnuté kvůli povinnostem k obalům).
import { SLOVAKIA_DELIVERY_ALLOWED } from "./shipping";
import { syrupModelLine } from "./portionPrices";

export const FAQ_PATH = "/caste-otazky";

export type FaqItem = {
  question: string;
  answer: string;
  /** úvodní věta s odkazem (ochutnávka polévek, 24. 11. 2026); answer = lead + rest kvůli JSON-LD */
  lead?: string;
  rest?: string;
  link?: { label: string; href: string };
};

export const FAQ_ITEMS: FaqItem[] = [
  // 22. 11. 2026 (Lucie): první dvě otázky přesně v tomto znění; dopravce se nejmenuje (Jarin)
  {
    question: "Kde si můžeme objednat hotové polévky a nápoje do kavárny?",
    answer:
      "Přímo na e-shopu Begina. Polévky dodáváme v třílitrových sáčcích s kohoutkem. Natočíte si porci a ohřejete ji. Z nápojů se vodou ředí pouze sirupy. Čaje a ovocné nápoje můžete rovnou podávat.",
  },
  {
    question: "Jak posíláte objednávky po České republice?",
    answer:
      `Chlazené objednávky posíláme po celé ČR chlazenou přepravou. Před doručením se Vám ozve přímo dopravce. Cena přepravy závisí na hmotnosti zásilky.${SLOVAKIA_DELIVERY_ALLOWED ? " Doručujeme i na Slovensko (kromě alkoholických nápojů)." : ""} Vybrané sirupy v kapsičkách a ochutnávkový set sirupů posíláme také Zásilkovnou. Objednávku si můžete po domluvě zdarma vyzvednout i v našem bistru ve Viticích.`,
  },
  {
    question: "Jak dlouho vydrží polévka po otevření?",
    answer:
      "Polévku skladujte v lednici do 4 °C před otevřením i po něm. Beginu 3 l s kohoutkem spotřebujte po otevření do 14 dnů. Malý sáček (ochutnávka 450 ml, vzorek 200 ml) spotřebujte po otevření do 5 dnů. Vždy rozhoduje datum „Spotřebujte do“ na obalu – otevřením nezačíná nová lhůta, která by ho přesáhla.",
  },
  {
    question: "Jsou vaše polévky veganské?",
    answer:
      "Ano. Polévky a nealkoholické nápoje jsou 100% rostlinné, vhodné pro vegany i vegetariány. Vyrábíme je z čisté filtrované vody a bez konzervantů.",
  },
  {
    question: "Kolik stojí porce polévky?",
    get answer() {
      return `Polévka v begině 3 l stojí 379 Kč a vystačí až na 12 porcí po 250 ml – porce tak vychází na 31,58 Kč. Nápoj ze sirupu: ${syrupModelLine(true)}`;
    },
  },
  {
    question: "Můžu si objednat i domů?",
    answer:
      "Ano. Objednat si můžete i domů. Polévky posíláme chlazeně po celé ČR. Před doručením se Vám ozve dopravce.",
  },
  {
    question: "Jak ochutnat polévky a sirupy?",
    answer:
      "K první třílitrové begině Vám přibalíme 2 vzorky polévek a 2 vzorky sirupů zdarma. Platí k begině 3 l polévky, sirupu, Svařáku Deluxe nebo Lady Carneval, pro kavárny, bistra i domácnosti. Dárek získáte jednou, i když v první objednávce koupíte víc begin. K objednávce třílitrové beginy si můžete přidat další vzorky za 49 Kč za kus. Pošleme chlazenou přepravou, nebo si objednávku vyzvednete ve Viticích. Chcete ochutnat jen sirupy? Vyberte si 5 příchutí v Ochutnávkovém setu sirupů 5 × 100 ml. Vzorky polévek po 200 ml za 49 Kč si můžete po domluvě vyzvednout v Zahradním bistru Begina ve Viticích.",
  },
  {
    question: "Mají kavárny a bistra zvláštní ceník?",
    answer: "Ceny jsou stejné jako na e-shopu. Při pravidelném odběru získáte slevu 3 až 7 % v partnerském programu.",
  },
  {
    question: "Jak se polévka z beginy připravuje?",
    answer: "Beginu vezmete do ruky a natočíte kohoutkem jen objednanou porci. Polévku ohřejete, sirup zalijete vodou. Zbytek počká v lednici.",
  },
  {
    question: "Kde můžu Beginu ochutnat?",
    answer: "V Zahradním bistru Begina ve Viticích – Vitice 119, areál Zahradnictví Jandl.",
  },
];

export const FAQ_PAGE: InfoPage = {
  path: FAQ_PATH,
  footerLabel: "Časté otázky",
  title: "Časté otázky",
  description: "Hotové polévky a nápoje pro kavárny a bistra i domů: doprava po celé ČR, trvanlivost, cena porce, ochutnávka do provozu.",
  blocks: faqBlocks(FAQ_ITEMS),
  hideOperatorLine: true,
};

/** Bloky stránky; otázka s úvodní větou dostane odkaz hned za ní. */
export function faqBlocks(items: readonly FaqItem[]): InfoPage["blocks"] {
  return items.map((item) =>
    item.lead && item.link
      ? { heading: item.question, paragraphs: [item.lead, ...(item.rest ? [item.rest] : [])], linkAfterFirst: item.link }
      : { heading: item.question, paragraphs: [item.answer] }
  );
}

export const FAQ_CTA = { text: "Vyzkoušet Beginu v provozu", href: CAFE_PATH } as const;

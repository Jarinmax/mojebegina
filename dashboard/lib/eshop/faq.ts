// Stránka „Časté otázky“ (begina.cz/caste-otazky) — zadání Lucie 20. 11. 2026:
// zákaznice nás našla přes ChatGPT, chceme to posílit. Otázky tak, jak se lidé
// ptají vyhledávačů a AI; odpovědi JEN z údajů, které už na webu jsou
// (cafePage.ts, homeContent.ts, stránka Doprava, katalog: polévky 3 l za 379 Kč,
// 12 porcí, po otevření 14 dní). Žádná zdravotní tvrzení, vykání.
// Ze stejných dat se skládá i FAQPage JSON-LD (seo.ts → faqJsonLd).
import { CAFE_PATH } from "./cafePage";
import type { InfoPage } from "./infoPages";

export const FAQ_PATH = "/caste-otazky";

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Kdo dováží hotové polévky do kavárny?",
    answer:
      "Begina. Kavárnám a bistrům dovážíme hotové polévky a nápoje po celé ČR chlazenou přepravou – v begině, 3l sáčku s kohoutkem. Polévku stačí ohřát a podávat, nápoje jen naředit. Objednáte přímo na e-shopu begina.cz, na firmu i s IČO.",
  },
  {
    question: "Dovezete polévky po celé ČR?",
    answer:
      "Ano. Polévky i nápoje vozíme chlazenou přepravou po celé České republice, cena se řídí hmotností objednávky. Doručujeme i na Slovensko (kromě alkoholických nápojů). Sáčky se sirupem posíláme také Zásilkovnou a objednávku si můžete po domluvě vyzvednout osobně v Zahradním bistru Begina ve Viticích.",
  },
  {
    question: "Jak dlouho vydrží polévka po otevření?",
    answer:
      "Polévky a čaje vydrží po otevření v lednici 14 dní, sirupy 3 měsíce. Polévky skladujte v chladničce do 4 °C před otevřením i po otevření; neotevřené balení spotřebujte do data uvedeného na obalu.",
  },
  {
    question: "Jsou vaše polévky veganské?",
    answer:
      "Ano. Polévky a nealkoholické nápoje jsou 100% rostlinné, vhodné pro vegany i vegetariány. Vyrábíme je z čisté filtrované vody a bez konzervantů.",
  },
  {
    question: "Kolik stojí porce polévky?",
    answer:
      "Polévka v begině 3 l stojí 379 Kč a vystačí až na 12 porcí po 250 ml – porce tak vychází na 31,60 Kč. Nápoj ze sirupu vychází od 3,30 Kč.",
  },
  {
    question: "Můžu si objednat i domů?",
    answer:
      "Ano. Objednáte na e-shopu begina.cz a doručíme vám chlazenou přepravou až domů. Sirupy jsou i v menším balení, od 199 Kč za 650 ml, a ochutnávkový set 5 sirupů stojí 349 Kč.",
  },
  {
    question: "Jak objednat ochutnávku do provozu?",
    answer:
      "Vyplňte formulář „Chci ochutnávku do provozu“ na stránce Pro kavárny a bistra nebo na úvodní stránce. Ozveme se vám do 2 pracovních dnů. Ochutnávku vám přivezeme, nebo pošleme chlazenou přepravou.",
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
  blocks: FAQ_ITEMS.map((item) => ({ heading: item.question, paragraphs: [item.answer] })),
  hideOperatorLine: true,
};

export const FAQ_CTA = { text: "Chci ochutnávku do provozu", href: `${CAFE_PATH}#ochutnavka` } as const;

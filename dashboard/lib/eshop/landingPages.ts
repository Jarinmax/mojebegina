// Stránky pro konkrétní dotazy ve vyhledávačích a AI (zadání Lucie 20. 11. 2026):
// krátký úvod, výhody, 4–6 otázek a odpovědí, odkazy na produkty a na ochutnávku.
// Texty JEN z údajů, které už na webu jsou (úvody kategorií v katalogu, cafePage.ts,
// ceny a počty porcí z katalogu). Nikdy „bez lepku“ ani „bezlepkové“, žádná zdravotní
// tvrzení, alkohol se nepropaguje jako rostlinný. Vykání, názvy produktů přesně z e-shopu.
// Ze stejných otázek se skládá FAQPage JSON-LD (seo.ts → faqJsonLd).
import { CAFE_PATH } from "./cafePage";
import type { FaqItem } from "./faq";

export type LandingLink = { label: string; href: string };
export type LandingPage = {
  path: string;
  /** Nadpis H1 a titulek stránky. */
  title: string;
  description: string;
  intro: string[];
  benefits: { title: string; text: string }[];
  faq: FaqItem[];
  /** Odkazy na produkty a kategorie (přesné názvy z e-shopu). */
  links: LandingLink[];
};

const TASTING = { label: "Chci ochutnávku do provozu", href: CAFE_PATH };
export const LANDING_TASTING_LINK = TASTING;

const DELIVERY_ANSWER =
  "Ano. Vozíme chlazenou přepravou po celé České republice, cena se řídí hmotností objednávky. Objednávku si můžete po domluvě vyzvednout i osobně v Zahradním bistru Begina ve Viticích.";
const ORDER_ANSWER =
  "Objednáte přímo na e-shopu begina.cz, na firmu i s IČO. Ceny jsou stejné jako na e-shopu a při pravidelném odběru získáte slevu 3 až 7 % v partnerském programu.";
const TASTING_ANSWER =
  "Na stránce Pro kavárny a bistra si vyberete polévky, sirupy a Svařák Deluxe, každou položku za 49 Kč. Objednáte na firmu s IČO a pošleme vám je chlazenou přepravou, nebo si je vyzvednete ve Viticích.";

const product = (label: string, slug: string): LandingLink => ({ label, href: `/produkt/${slug}` });

export const LANDING_PAGES: LandingPage[] = [
  {
    path: "/polevky-pro-kavarny",
    title: "Hotové polévky pro kavárny a bistra s dovozem po celé ČR",
    description: "Hotové polévky v begině 3 l s kohoutkem pro kavárny a bistra. Stačí ohřát a podávat, porce 250 ml za 31,60 Kč, chlazená doprava po celé ČR.",
    intro: [
      "Kavárnám a bistrům dovážíme hotové polévky po celé ČR chlazenou přepravou. Vaříme je ze zeleniny, hub, bylinek, koření a čisté filtrované vody.",
      "Polévka přijede v begině, třílitrovém sáčku s kohoutkem. Natočíte vždy jen objednanou porci, ohřejete a podáváte.",
    ],
    benefits: [
      { title: "Bez práce", text: "Polévku stačí ohřát a podávat." },
      { title: "Žádné zbytky", text: "Natočíte vždy jen objednanou porci, zbytek počká v lednici. Po otevření vydrží v lednici 14 dní." },
      { title: "Spočítané porce", text: "Begina 3 l za 379 Kč vystačí až na 12 porcí po 250 ml – porce za 31,60 Kč." },
      { title: "Doprava po celé ČR", text: "Chlazená přeprava až k vám, nebo osobní odběr ve Viticích." },
    ],
    faq: [
      { question: "Kdo dováží hotové polévky do kavárny?", answer: "Begina. Kavárnám a bistrům dovážíme hotové polévky a nápoje po celé ČR chlazenou přepravou – v begině, 3l sáčku s kohoutkem. Objednáte přímo na e-shopu begina.cz, na firmu i s IČO." },
      { question: "Dovezete polévky po celé ČR?", answer: DELIVERY_ANSWER },
      { question: "Kolik stojí porce polévky?", answer: "Polévka v begině 3 l stojí 379 Kč a vystačí až na 12 porcí po 250 ml – porce tak vychází na 31,60 Kč." },
      { question: "Jak dlouho vydrží polévka po otevření?", answer: "Po otevření vydrží v lednici 14 dní. Polévky skladujte v chladničce do 4 °C před otevřením i po otevření; neotevřené balení spotřebujte do data uvedeného na obalu." },
      { question: "Jak se polévka připravuje?", answer: "Natočíte kohoutkem jen objednanou porci a ohřejete. Zbytek počká v lednici." },
      { question: "Jak objednat ochutnávku do provozu?", answer: TASTING_ANSWER },
    ],
    links: [
      { label: "Čerstvé polévky – celá nabídka", href: "/kategorie/polevky" },
      product("Dýňová polévka", "dynova-polevka"),
      product("Kulajda", "kulajda"),
      product("Tomatová polévka", "rajcatova-polevka"),
      product("Rajčatová polévka s červenou řepou", "rajcatova-polevka-s-cervenou-repou"),
      product("Gulášová polévka z hlívy ústřičné", "gulasova-polevka-z-hlivy-ustricne"),
      product("Špenátová polévka", "spenatova-polevka"),
    ],
  },
  {
    path: "/veganske-polevky",
    title: "Veganské polévky pro kavárny a bistra",
    description: "Polévky Begina jsou z rostlinných surovin, bez masa a mléčných výrobků – vhodné pro vegany i vegetariány. V begině 3 l s kohoutkem, doprava po celé ČR.",
    intro: [
      "Všechny polévky Begina jsou z rostlinných surovin, bez masa a mléčných výrobků, vhodné pro vegany i vegetariány.",
      "Vaříme je ze zeleniny, hub, bylinek, koření a čisté filtrované vody. Kavárnám a bistrům je dovážíme po celé ČR chlazenou přepravou.",
    ],
    benefits: [
      { title: "100% rostlinné", text: "Polévky jsou vhodné pro vegany i vegetariány." },
      { title: "Z čisté filtrované vody", text: "Polévky vyrábíme bez konzervantů." },
      { title: "Bez práce", text: "Polévku stačí ohřát a podávat." },
      { title: "Žádné zbytky", text: "Natočíte vždy jen objednanou porci, zbytek po otevření vydrží v lednici 14 dní." },
    ],
    faq: [
      { question: "Jsou vaše polévky veganské?", answer: "Ano. Všechny polévky Begina jsou z rostlinných surovin, bez masa a mléčných výrobků, vhodné pro vegany i vegetariány." },
      { question: "Jaké veganské polévky nabízíte?", answer: "Dýňovou polévku, Kulajdu, Tomatovou polévku, Rajčatovou polévku s červenou řepou, Gulášovou polévku z hlívy ústřičné a Špenátovou polévku." },
      { question: "Kolik stojí porce polévky?", answer: "Polévka v begině 3 l stojí 379 Kč a vystačí až na 12 porcí po 250 ml – porce tak vychází na 31,60 Kč." },
      { question: "Dovezete polévky po celé ČR?", answer: DELIVERY_ANSWER },
      { question: "Jak objednat ochutnávku do provozu?", answer: TASTING_ANSWER },
    ],
    links: [
      { label: "Čerstvé polévky – celá nabídka", href: "/kategorie/polevky" },
      product("Dýňová polévka", "dynova-polevka"),
      product("Kulajda", "kulajda"),
      product("Gulášová polévka z hlívy ústřičné", "gulasova-polevka-z-hlivy-ustricne"),
      product("Špenátová polévka", "spenatova-polevka"),
    ],
  },
  {
    path: "/bylinne-sirupy-pro-kavarny",
    title: "Bylinné sirupy pro kavárny a bary",
    description: "Bylinné sirupy Begina z bylinek, koření, třtinového cukru a čisté filtrované vody. Begina 3 l s kohoutkem až na 150 nápojů, nápoj od 3,30 Kč.",
    intro: [
      "Bylinné sirupy Begina vaříme z bylinek, koření, třtinového cukru a čisté filtrované vody. Bez umělých aromat a barviv.",
      "Z jednoho sirupu připravíte limonádu, horký nápoj i koktejl. Pro provoz je nejvýhodnější třílitrová begina s kohoutkem.",
    ],
    benefits: [
      { title: "Až 150 nápojů z beginy", text: "Begina 3 l vystačí až na 150 nápojů, nápoj už od 3,30 Kč." },
      { title: "Jednoduché ředění", text: "Na sklenici stačí 20 ml sirupu doplnit vodou na 200 ml (zhruba 1 : 10) – studenou na limonádu, horkou na čaj." },
      { title: "Žádné zbytky", text: "Natočíte vždy jen objednanou porci. Po otevření vydrží v lednici 3 měsíce." },
      { title: "Doprava po celé ČR", text: "Chlazená přeprava až k vám, nebo osobní odběr ve Viticích." },
    ],
    faq: [
      { question: "Jak se sirup ředí?", answer: "Na sklenici stačí 20 ml sirupu doplnit vodou na 200 ml (zhruba 1 : 10) – studenou na limonádu, horkou na čaj. Hodí se i do koktejlů a do kuchyně." },
      { question: "Kolik nápojů je z jedné beginy?", answer: "Z třílitrové beginy s kohoutkem připravíte až 150 nápojů, nápoj vychází už od 3,30 Kč. Stříbrný sáček 650 ml se šroubovacím uzávěrem vystačí až na 32 nápojů." },
      { question: "Jak dlouho vydrží sirup po otevření?", answer: "Sirupy po otevření vydrží v lednici 3 měsíce." },
      { question: "Jak objednat sirupy do provozu?", answer: ORDER_ANSWER },
      { question: "Jak objednat ochutnávku do provozu?", answer: TASTING_ANSWER },
    ],
    links: [
      { label: "Bylinné sirupy – celá nabídka", href: "/kategorie/sirupy" },
      product("Bylinný sirup Šaman", "bylinny-sirup-saman"),
      product("Lipový sirup", "lipovy-sirup"),
      product("Zázvorový sirup", "zazvorovy-sirup"),
      product("Ibiškový sirup", "ibiskovy-sirup"),
      product("Šípkový sirup", "sipkovy-sirup"),
      product("Heřmánkový sirup", "hermankovy-sirup"),
      product("Meduňkový sirup s levandulí", "medunkovy-sirup-s-levanduli"),
    ],
  },
  {
    path: "/caje-a-limonady-pro-gastro",
    title: "Čaje a nápoje z kohoutku pro gastro",
    description: "Hotové čaje a ovocné nápoje v begině 3 l s kohoutkem pro kavárny, bistra a bary. Natočit, podávat ledové nebo ohřáté. Doprava po celé ČR.",
    intro: [
      "Čaje Begina jsou hotové nápoje uvařené z bylin a čajových lístků, oslazené třtinovým cukrem a dochucené citronem. Ovocné nápoje mícháme z ovocných šťáv a čisté filtrované vody, bez přidaného cukru – obsahují jen přirozeně přítomné cukry z ovoce.",
      "Oboje přijede v begině, třílitrovém sáčku s kohoutkem. Z bylinných sirupů si navíc připravíte limonády.",
    ],
    benefits: [
      { title: "Bez práce", text: "Čaj natočíte z beginy a podáte ledový, nebo ohřátý na horký čaj." },
      { title: "Žádné zbytky", text: "Čaje po otevření vydrží v lednici 14 dní, ovocné nápoje spotřebujte do 5 dnů." },
      { title: "Limonády ze sirupu", text: "20 ml bylinného sirupu doplníte studenou vodou na 200 ml." },
      { title: "Doprava po celé ČR", text: "Chlazená přeprava až k vám, nebo osobní odběr ve Viticích." },
    ],
    faq: [
      { question: "Jak se čaj z beginy podává?", answer: "Stačí natočit z beginy a podávat ledový, nebo ohřát na horký čaj." },
      { question: "Kolik porcí je v jedné begině?", answer: "Begina 3 l čaje nebo ovocného nápoje vystačí až na 12 porcí po 250 ml." },
      { question: "Jak dlouho vydrží po otevření?", answer: "Čaje vydrží v lednici po otevření 14 dní. Ovocné nápoje vyrábíme čerstvé až na objednávku a po otevření je spotřebujte do 5 dnů." },
      { question: "Jak připravíte limonádu?", answer: "Z bylinného sirupu: na sklenici stačí 20 ml sirupu doplnit studenou vodou na 200 ml (zhruba 1 : 10)." },
      { question: "Dovezete nápoje po celé ČR?", answer: DELIVERY_ANSWER },
      { question: "Jak objednat ochutnávku do provozu?", answer: TASTING_ANSWER },
    ],
    links: [
      { label: "Čaje – celá nabídka", href: "/kategorie/caje" },
      { label: "Ovocné nápoje – celá nabídka", href: "/kategorie/ovocne-napoje" },
      { label: "Bylinné sirupy na limonády", href: "/kategorie/sirupy" },
      product("Bylinný čaj Šaman", "bylinny-caj-saman"),
      product("Lipový čaj", "lipovy-caj"),
      product("Černý čaj Golden Nepal", "cerny-caj-golden-nepal"),
      product("Jasmínový zelený čaj", "jasminovy-zeleny-caj"),
      product("Červánkové nebe", "cervankove-nebe"),
      product("Dům u jezera", "dum-u-jezera"),
    ],
  },
];

export const LANDING_PATHS = LANDING_PAGES.map((page) => page.path);

export function findLandingPage(path: string): LandingPage | undefined {
  return LANDING_PAGES.find((page) => page.path === path);
}

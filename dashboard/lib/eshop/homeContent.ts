// Texty úvodní stránky pod pruhem kategorií (návrh schválený majitelem 11. 11. 2026).
// Konkrétní fakta místo obecných frází; ceny a výdrž podle e-shopu a etiket.

import { syrupModelKc, syrupModelLine } from "./portionPrices";
export const HOME_WHY = [
  // 16. 11. 2026 (Lucie): trvanlivost po otevření jako první
  { icon: "clock", title: "Vydrží i po otevření", text: "Polévky a čaje 14 dní v lednici – natáčíte postupně." },
  { icon: "leaf", title: "100% rostlinné polévky a nealko nápoje", text: "Polévky a nealkoholické nápoje jsou bez živočišných surovin." },
  { icon: "soup", get title() { return `Nápoj od ${syrupModelKc()} i s dopravou`; }, get text() { return syrupModelLine(); } },
  // 14. 11. 2026 (Lucie): partnerský program má být vidět na úvodu, dlaždice vede na stránku programu
  { icon: "percent", title: "Partnerský program", text: "Čím víc nakoupíte, tím větší sleva: 3 až 7 %.", href: "/partnersky-program", linkLabel: "Jak to funguje" },
] as const;

/** Výhody spojené se sekcí Jak funguje begina (22. 11. 2026, dřív samostatně „Proč Beginu berou kavárny a bistra“). */
export const HOME_STEP_POINTS = [
  "Žádné zbytky: po otevření vydrží polévky a čaje v lednici 14 dní, sirupy 3 měsíce.",
  "100% rostlinné polévky a nealko nápoje.",
  "Sirupy, čaje a ovocné nápoje bez konzervantů.",
] as const;

/** Věta pod „Jak funguje begina“ na úvodu (Lucie 25. 11. 2026): pro všechny, ne jen kavárny; Zásilkovna jen pro menší objednávky sirupů. */
export const HOME_DELIVERY_LINE =
  "Polévky a nápoje posíláme chlazenou přepravou po celé ČR, do kaváren, bister i domů. Zásilkovnou pošleme 1–4 sáčky sirupu, ochutnávkový set nebo jednu třílitrovou beginu sirupu.";

export const HOME_STEPS = [
  { title: "Pošleme vám ji", text: "Polévky a nápoje posíláme chlazenou přepravou, menší objednávky sirupů i Zásilkovnou." },
  { title: "Uložíte ji do lednice", text: "Zabere málo místa a obsah zůstane čerstvý." },
  { title: "Natočíte si porci", text: "Polévku stačí ohřát, sirup naředit vodou a čaj nebo ovocný nápoj rovnou podávat." },
] as const;

/** Nejoblíbenější produkty v pořadí od vedení (Lucie 14. 11. 2026: polévka, výrazný a jemný sirup, zimní koktejl). */
export const HOME_BESTSELLERS = [
  "dynova-polevka",
  "bylinny-sirup-saman",
  "lipovy-sirup",
  "svarak-deluxe",
] as const;

export const HOME_ABOUT =
  "Begina vzniká v naší kuchyni. Recepty ladíme tak dlouho, dokud nechutnají tak, jak chceme my sami – z pečlivě vybraných surovin a čisté filtrované vody.";

export const HOME_BISTRO = "Ochutnat nás můžete i v Zahradním bistru Begina ve Viticích (areál Zahradnictví Jandl).";

export const HOME_STEPS_PHOTO = "/eshop/hero/polevka-kavarna-v14.webp"; // 28. 11. 2026: atmosférická (dřívější úvodní fotka, begina v lednici); dřív bílá /eshop/polevky/dynova-polevka-begina-v6.jpg

/** Tři hlavní výhody hned pod nadpisem úvodu, viditelné bez posouvání (16. 11. 2026). */
export const HOME_HERO_POINTS = ["Po otevření vydrží polévky a čaje 14 dní, sirupy 3 měsíce", "100% rostlinné polévky a nealko nápoje", "Doručíme chlazeně po celé ČR"] as const; // dřív „Chlazeně až domů“ — úvod je pro kavárny (Lucie 22. 11. 2026)

// Přestavba úvodu pro kavárny a bistra (Lucie 20. 11. 2026): kavárny a bistra dělají 80–90 %
// objednávek, ale zákazník nakupující domů musí vidět, že je vítaný. Texty jen z webu
// (hlavně ze stránky Pro kavárny a bistra), nic nového.
export const HOME_HERO_TITLE = "Vy jen ohřejete, hosté to pochválí."; // 28. 11. 2026 20:03 (Jarin přes Lucii); před tím "Hosté ji pochválí. Vy ji jen ohřejete." // 28. 11. 2026 večer (Lucie): podle toho, co kavárny chválí – hotové, jen ohřát, hosté říkají „máte to dobré“; dřív "Polévka a limonáda na menu. Bez vaření." // 28. 11. 2026 (Lucie + Jarin): nová úvodní stránka, nadpis s přínosem; dřív "Polévky a nápoje pro kavárny, bistra i domů" // 25. 11. 2026 (Lucie): ať zákazník domů hned vidí, že nakoupit může i on
// 22. 11. 2026 (Lucie): „Posíláme chlazeně“ — zásilky veze dopravce, dopravce se nejmenuje (Jarin)
export const HOME_HERO_SUBTITLE = ["Hotové polévky, bylinkové sirupy a další nápoje z kohoutku.", "Posíláme chlazeně po celé ČR."] as const; // Lucie 28. 11.: sirupy se neohřívají, máme i jiné nápoje // 28. 11. 2026; dřív "Polévku stačí ohřát, sirup naředit."
export const HOME_HERO_BUTTON = "Vybrat první beginu 3 l"; // 24. 11. 2026 (Lucie/ChatGPT): vedle je druhé tlačítko „Ochutnat 3 polévky“; dřív „Vybrat polévky a nápoje“ // dřív „Vybrat první balení“ — Jarin nepoznal, že vede k polévkám (Lucie 24. 11. 2026)
export const HOME_HERO_PHONE = "Domluvit dodávky po telefonu";

/** Věta pod červeným tlačítkem v úvodu (22. 11. 2026). */
export const HOME_HERO_OFFER = "K první begině Vám přibalíme 2 vzorky polévek a 2 vzorky sirupů zdarma.";
/** 28. 11. 2026: drobný odkaz pod nabídkou místo druhého tlačítka */
export const HOME_HERO_TASTE_LINK = "Nebo nejdřív ochutnat 3 polévky za 299 Kč";
/** Druhé tlačítko v úvodu (24. 11. 2026). */
export const HOME_HERO_TASTE_BUTTON = "Ochutnat 3 polévky";
/** 27. 11. 2026 (Lucie): popisek pod úvodní fotkou – krabice není v ceně beginy, kavárny ji dávají rovnou do lednice. */
export const HOME_HERO_BOX_NOTE = "Krabici k begině si můžete přikoupit v košíku za 19 Kč. Sirupy posíláme v krabici vždy.";

export const HOME_HERO_TASTE_NOTE = "3 × 450 ml za 299 Kč + chlazená doprava";

export const HOME_TILE_CAFE = {
  title: "Pro kavárny a bistra",
  points: [
    "K první begině 2 vzorky polévek a 2 vzorky sirupů zdarma.",
    "Objednáte přímo tady na e-shopu, na firmu i s IČO.",
    "Čím víc objednáte, tím větší slevu dostanete v partnerském programu (3 až 7 %).",
  ],
  // 22. 11. 2026 (Lucie): červené „Vyzkoušet Beginu v provozu“ jen u fotky nahoře; tady obrysové tlačítko s jiným textem
  button: "Jak to funguje pro kavárny",
  // Odkaz na nabídku polévek (dokument ChatGPT „SEO pro kavárny“, Lucie 22. 11. 2026)
  extraText: "Ceny porcí s dopravou:",
  extraLink: { label: "Polévky pro kavárny", href: "/polevky-pro-kavarny" },
  // na začátek stránky, ať si podnik nejdřív přečte, jak spolupráce funguje (Lucie 20. 11. 2026 večer)
  href: "/pro-kavarny",
} as const;

// Bez „zdarma“ a bez kampaňové ceny 189 Kč (Lucie 20. 11. 2026).
export const HOME_TILE_HOME = {
  title: "Nakupuji domů",
  points: ["Bylinkové sirupy v begině 3 l od 499 Kč.", "Ochutnávkový set 5 sirupů za 349 Kč, poslat jde i Zásilkovnou.", "Chlazená doprava po celé ČR."],
  button: "Nakoupit domů",
  // Stránka jen pro zákazníky domů: kategorie a nejoblíbenější (Lucie 20. 11. 2026 večer).
  href: "/nakupuji-domu",
} as const;

/** Stránka Nakupuji domů (/nakupuji-domu) — texty z dlaždice Nakupuji domů. */
type SyrupProduct = { category: string; variants: readonly { priceKc: number; volumeMl: number | null; label: string | null; soldOut?: boolean }[] };

/**
 * 22. 11. 2026 (Lucie): „od 499 Kč za 3 l“ neplatilo — sirupy jsou i v sáčku. Bod se počítá
 * z katalogu: nejlevnější sáček, který je skladem (vyprodané se nepočítají), a nejlevnější begina 3 l.
 */
export function homeSyrupPoint(products: readonly SyrupProduct[]): string {
  const variants = products.filter((p) => p.category === "sirupy").flatMap((p) => p.variants).filter((v) => v.soldOut !== true);
  const small = variants.filter((v) => v.volumeMl !== null && v.volumeMl < 3000).sort((a, b) => a.priceKc - b.priceKc)[0];
  const big = variants.filter((v) => v.volumeMl === 3000).sort((a, b) => a.priceKc - b.priceKc)[0];
  if (small && big) return `Bylinkové sirupy od ${small.priceKc}\u00a0Kč (sáček ${small.label}), begina 3\u00a0l od ${big.priceKc}\u00a0Kč.`;
  if (big) return `Bylinkové sirupy v begině 3 l od ${big.priceKc} Kč.`;
  return "Bylinkové sirupy z bylinek a třtinového cukru.";
}

export const HOME_SHOP_HOME = {
  path: "/nakupuji-domu",
  title: "Nakupuji domů",
  description: "Čerstvé polévky, bylinkové sirupy, čaje, ovocné nápoje, koktejly a zmrzliny Begina domů. Chlazená doprava po celé ČR, ochutnávkový set sirupů i Zásilkovnou.",
  points: ["Bylinkové sirupy v begině 3 l od 499 Kč", "Ochutnávkový set 5 sirupů za 349 Kč, i Zásilkovnou", "Chlazená doprava po celé ČR"],
} as const;

export const HOME_WHY_TITLE = "Proč Beginu berou kavárny a bistra";

/**
 * „Kde nás najdete“ — kavárny a bistra, které Beginu odebírají. Sekce je schovaná,
 * dokud je seznam prázdný; doplňuje se jen se souhlasem kaváren (Lucie 20. 11. 2026).
 */
/** Jen kavárny, které písemně souhlasily s uvedením (e-maily na info@ 28. 11. 2026). */
export const HOME_VENUES: { name: string; city?: string }[] = [
  { name: "Café Kandík", city: "Hradištko" }, // souhlas 28. 11. 2026 (Ing. Markéta Bejkovská)
  { name: "Cukrárna Kavárna Adélka", city: "Jílové u Prahy" }, // souhlas 28. 11. 2026 (T. S. Zeithaml), název podle jejich odpovědi
  { name: "Kavárna Academia", city: "Praha 1" }, // souhlas 28. 11. 2026 (Milan Kašpárek), název podle jeho podpisu
];
export const HOME_VENUES_TITLE = "Kde Beginu nalévají";
/** 28. 11. 2026 večer (Lucie): na úvodu žádné názvy kaváren, jen odkaz; kavárny a proč si Beginu chválí jsou na stránce Pro kavárny. */
export const HOME_REFERENCES_LINK = { eyebrow: "Co nám říkají kavárny", quote: "„Hosté to chválí a vracejí se.“", text: "Proč si nás kavárny chválí", href: "/pro-kavarny#kavarny-chvali" } as const;
export const CAFE_PRAISE_TITLE = "Proč si Beginu kavárny chválí";
export const CAFE_PRAISE_POINTS = [
  "Je to hotové – nic nevaříte, jen natočíte a ohřejete.",
  "Hosté se vracejí a říkají, že je to dobré.",
  "Natočíte jen tolik porcí, kolik zrovna potřebujete.",
] as const;
export const CAFE_PRAISE_VENUES_TITLE = "Beginu nalévají například";

/** Dlaždice Domů: cena setu sirupů podle katalogu (během akce 189 Kč vč. dopravy – Lucie 28. 11. 2026). */
export function homeDoorHomeText(setPriceKc: number, includesShipping: boolean): string {
  return `Ochutnejte 3 polévky za 299 Kč nebo sadu 5 sirupů za ${setPriceKc} Kč${includesShipping ? " včetně dopravy" : ""}.`;
}
export function homeShopSetPoint(setPriceKc: number, includesShipping: boolean): string {
  return includesShipping ? `Ochutnávkový set 5 sirupů za ${setPriceKc} Kč včetně dopravy` : `Ochutnávkový set 5 sirupů za ${setPriceKc} Kč, i Zásilkovnou`;
}

/** 28. 11. 2026: dvě dlaždice pod úvodem – každý zákazník si zvolí svou cestu. */
export const HOME_DOORS = [
  { title: "Pro kavárny a bistra", text: "Hotové polévky a sirupy na menu. K první begině 2 + 2 vzorky zdarma.", button: "Nabídka pro kavárny", href: "/pro-kavarny", photo: "/eshop/uvod/begina-krabice-lipovy-sirup-kavarna-4x5.webp", alt: "Obsluha v kavárně točí Lipový sirup z krabice s kohoutkem do hrnku" },
  { title: "Domů", text: "Ochutnejte 3 polévky za 299 Kč nebo sadu 5 sirupů za 349 Kč.", button: "Nakoupit domů", href: "/nakupuji-domu", photo: "/eshop/uvod/svarak-deluxe-zima-4x5.webp", alt: "Ruce drží sklenici horkého Svařáku Deluxe, vedle pomeranč a koření" },
] as const;

/** 28. 11. 2026: atmosférické fotky u nejoblíbenějších na úvodu (bílé produktové fotky zůstávají v kategoriích a u produktů). */
export const HOME_BESTSELLER_PHOTOS: Record<string, string> = {
  "dynova-polevka": "/eshop/uvod/dynova-polevka-bistro-4x5.webp",
  "bylinny-sirup-saman": "/eshop/uvod/bylinny-sirup-saman-zima-4x5.webp",
  "lipovy-sirup": "/eshop/uvod/lipovy-sirup-limonada-leto-4x5.webp",
  "svarak-deluxe": "/eshop/uvod/svarak-deluxe-zima-4x5.webp",
};

type PricedProduct = { slug: string; category: string; variants: readonly { priceKc: number; volumeMl: number | null; label: string | null; soldOut?: boolean }[] };

/** Ceny pro pruh Nakupuji domů na úvodu (22. 11. 2026) — jen balení skladem. */
export function homeShopPrices(products: readonly PricedProduct[], setSlug: string) {
  const live = (category: string) => products.filter((p) => p.category === category).flatMap((p) => p.variants).filter((v) => v.soldOut !== true);
  const soup = live("polevky").filter((v) => v.volumeMl === 3000).sort((a, b) => a.priceKc - b.priceKc)[0];
  const syrup = live("sirupy").sort((a, b) => a.priceKc - b.priceKc)[0];
  const set = products.find((p) => p.slug === setSlug)?.variants.find((v) => v.soldOut !== true);
  return {
    soupKc: soup?.priceKc ?? null,
    syrupKc: syrup?.priceKc ?? null,
    syrupLabel: syrup && syrup.volumeMl !== null && syrup.volumeMl < 3000 ? syrup.label : null,
    setKc: set?.priceKc ?? null,
  };
}

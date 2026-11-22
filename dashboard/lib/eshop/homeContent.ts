// Texty úvodní stránky pod pruhem kategorií (návrh schválený majitelem 11. 11. 2026).
// Konkrétní fakta místo obecných frází; ceny a výdrž podle e-shopu a etiket.

export const HOME_WHY = [
  // 16. 11. 2026 (Lucie): trvanlivost po otevření jako první
  { icon: "clock", title: "Vydrží i po otevření", text: "Polévky a čaje 14 dní v lednici – natáčíte postupně." },
  { icon: "leaf", title: "100% rostlinné polévky a nealko nápoje", text: "Polévky a nealkoholické nápoje jsou bez živočišných surovin." },
  { icon: "soup", title: "Porce už od 3,30 Kč", text: "Nápoj ze sirupu od 3,30 Kč, porce polévky za 31,60 Kč." },
  // 14. 11. 2026 (Lucie): partnerský program má být vidět na úvodu, dlaždice vede na stránku programu
  { icon: "percent", title: "Partnerský program", text: "Čím víc nakoupíte, tím větší sleva: 3 až 7 %.", href: "/partnersky-program", linkLabel: "Jak to funguje" },
] as const;

/** Výhody spojené se sekcí Jak funguje begina (22. 11. 2026, dřív samostatně „Proč Beginu berou kavárny a bistra“). */
export const HOME_STEP_POINTS = [
  "Žádné zbytky: po otevření vydrží polévky a čaje v lednici 14 dní, sirupy 3 měsíce.",
  "100% rostlinné polévky a nealko nápoje.",
  "Z čisté filtrované vody a bez konzervantů.",
] as const;

export const HOME_STEPS = [
  { title: "Přijde vám chlazená", text: "Beginu doručíme chlazenou přepravou." },
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

export const HOME_STEPS_PHOTO = "/eshop/polevky/dynova-polevka-begina-v3.jpg";

/** Tři hlavní výhody hned pod nadpisem úvodu, viditelné bez posouvání (16. 11. 2026). */
export const HOME_HERO_POINTS = ["Po otevření vydrží polévky a čaje 14 dní, sirupy 3 měsíce", "100% rostlinné polévky a nealko nápoje", "Doručíme chlazeně po celé ČR"] as const; // dřív „Chlazeně až domů“ — úvod je pro kavárny (Lucie 22. 11. 2026)

// Přestavba úvodu pro kavárny a bistra (Lucie 20. 11. 2026): kavárny a bistra dělají 80–90 %
// objednávek, ale zákazník nakupující domů musí vidět, že je vítaný. Texty jen z webu
// (hlavně ze stránky Pro kavárny a bistra), nic nového.
export const HOME_HERO_TITLE = "Polévky a nápoje pro kavárny a bistra";
// 22. 11. 2026 (Lucie, návrh ChatGPT): „Dovážíme“ → „Doručíme“ (zásilky vozí CoolBalík, pravidlo Lucie)
export const HOME_HERO_SUBTITLE = ["Polévku stačí ohřát, sirup naředit.", "Doručíme chlazeně po celé ČR."] as const;
export const HOME_HERO_BUTTON = "Vybrat první balení";
export const HOME_HERO_PHONE = "Domluvit dodávky po telefonu";

/** Věta pod červeným tlačítkem v úvodu (22. 11. 2026). */
export const HOME_HERO_OFFER = "K první třílitrové begině na IČO přibalíme 2 vzorky polévek a 2 vzorky sirupů zdarma.";

export const HOME_TILE_CAFE = {
  title: "Pro kavárny a bistra",
  points: [
    "K první begině 2 polévky a 2 sirupy na ochutnání zdarma.",
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
  points: ["Bylinné sirupy v begině 3 l od 499 Kč.", "Ochutnávkový set 5 sirupů za 349 Kč, poslat jde i Zásilkovnou.", "Chlazená doprava po celé ČR."],
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
  if (small && big) return `Bylinné sirupy od ${small.priceKc}\u00a0Kč (sáček ${small.label}), begina 3\u00a0l od ${big.priceKc}\u00a0Kč.`;
  if (big) return `Bylinné sirupy v begině 3 l od ${big.priceKc} Kč.`;
  return "Bylinné sirupy z bylinek a třtinového cukru.";
}

export const HOME_SHOP_HOME = {
  path: "/nakupuji-domu",
  title: "Nakupuji domů",
  description: "Čerstvé polévky, bylinné sirupy, čaje, ovocné nápoje, koktejly a zmrzliny Begina domů. Chlazená doprava po celé ČR, ochutnávkový set sirupů i Zásilkovnou.",
  points: ["Bylinné sirupy v begině 3 l od 499 Kč", "Ochutnávkový set 5 sirupů za 349 Kč, i Zásilkovnou", "Chlazená doprava po celé ČR"],
} as const;

export const HOME_WHY_TITLE = "Proč Beginu berou kavárny a bistra";

/**
 * „Kde nás najdete“ — kavárny a bistra, které Beginu odebírají. Sekce je schovaná,
 * dokud je seznam prázdný; doplňuje se jen se souhlasem kaváren (Lucie 20. 11. 2026).
 */
export const HOME_VENUES: { name: string; city: string }[] = [];
export const HOME_VENUES_TITLE = "Kde nás najdete";

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

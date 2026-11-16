// Texty úvodní stránky pod pruhem kategorií (návrh schválený majitelem 11. 11. 2026).
// Konkrétní fakta místo obecných frází; ceny a výdrž podle e-shopu a etiket.

export const HOME_WHY = [
  // 16. 11. 2026 (Lucie): trvanlivost po otevření jako první
  { icon: "clock", title: "Vydrží i po otevření", text: "Polévky a čaje 14 dní v lednici – natáčíte postupně." },
  { icon: "leaf", title: "100 % rostlinné", text: "Všechny naše produkty jsou bez živočišných surovin." },
  { icon: "soup", title: "Porce už od 3,30 Kč", text: "Nápoj ze sirupu od 3,30 Kč, porce polévky za 31,60 Kč." },
  // 14. 11. 2026 (Lucie): partnerský program má být vidět na úvodu, dlaždice vede na stránku programu
  { icon: "percent", title: "Partnerský program", text: "Čím víc nakoupíte, tím větší sleva: 3 až 7 %.", href: "/partnersky-program", linkLabel: "Jak to funguje" },
] as const;

export const HOME_STEPS = [
  { title: "Přijde vám chlazená", text: "Beginu doručíme chlazenou přepravou." },
  { title: "Uložíte ji do lednice", text: "Zabere málo místa a obsah zůstane čerstvý." },
  { title: "Natočíte si porci", text: "Beginu vezmete do ruky a natočíte kohoutkem – polévku ohřejete, sirup zalijete vodou." },
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
export const HOME_HERO_POINTS = ["Polévky vydrží 14 dní po otevření", "100% rostlinné", "Chlazeně až domů"] as const;

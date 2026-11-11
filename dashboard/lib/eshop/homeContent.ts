// Texty úvodní stránky pod pruhem kategorií (návrh schválený majitelem 11. 11. 2026).
// Konkrétní fakta místo obecných frází; ceny a výdrž podle e-shopu a etiket.

export const HOME_WHY = [
  { icon: "leaf", title: "100 % rostlinné", text: "Všechny naše produkty jsou bez živočišných surovin." },
  { icon: "soup", title: "Až 12 porcí v jedné begině", text: "Polévka vyjde na 31,60 Kč za porci, ze sirupu je až 150 nápojů." },
  { icon: "clock", title: "Vydrží i po otevření", text: "Polévky a čaje 14 dní v lednici – natáčíte postupně." },
] as const;

export const HOME_STEPS = [
  { title: "Přijde vám chlazená", text: "Beginu doručíme chlazenou přepravou." },
  { title: "Uložíte ji do lednice", text: "Zabere málo místa a obsah zůstane čerstvý." },
  { title: "Natočíte si porci", text: "Beginu vezmete do ruky a natočíte kohoutkem – polévku ohřejete, sirup zředíte." },
] as const;

/** Nejoblíbenější produkty v pořadí od majitele. */
export const HOME_BESTSELLERS = [
  "dynova-polevka",
  "rajcatova-polevka",
  "gulasova-polevka-z-hlivy-ustricne",
  "bylinny-sirup-saman",
  "lipovy-sirup",
  "zazvorovy-sirup",
] as const;

export const HOME_ABOUT =
  "Begina vzniká v naší kuchyni. Recepty ladíme tak dlouho, dokud nechutnají tak, jak chceme my sami – z pečlivě vybraných surovin a čisté filtrované vody.";

export const HOME_BISTRO = "Ochutnat nás můžete i v Zahradním bistru Begina ve Viticích (areál Zahradnictví Jandl).";

export const HOME_STEPS_PHOTO = "/eshop/polevky/dynova-polevka-sacek.jpg";

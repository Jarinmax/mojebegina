// Ochutnávka do provozu — jen pro kavárny a bistra (zadání Lucie 20. 11. 2026).
// Čistá pravidla bez DB a bez Reactu.
//
// V DB je to jeden produkt (CAFE_TASTING_SLUG) ve vlastní kategorii a 14 balení:
// 6 polévek po 200 ml, 7 sirupů po 100 ml a Svařák Deluxe 200 ml, každé za 49 Kč. Provoz si na stránce
// Pro kavárny a bistra zaškrtne, co chce ochutnat (z každého nejvýš 1 kus), balení
// se vloží do košíku a objednávka jde běžnou pokladnou — vždy na firmu s IČO.
//
// Pravidla:
//   - produkt ani kategorie nejsou vidět v kategoriích, v Nejoblíbenějších, v sitemapě
//     ani ve feedu pro Google; stránka produktu přesměruje na Pro kavárny a bistra,
//   - jedna ochutnávka na jedno IČO (kontrola při výběru i při odeslání objednávky),
//   - doprava jen chlazená nebo osobní odběr (Zásilkovna ne),
//   - objednávka se zároveň zapíše jako lead „web – ochutnávka do provozu“.
//
// Trvanlivost polévky v sáčku 200 ml se zatím nevypisuje (Lucie doplní po testu).
// Ochutnávka je zapnutá (CAFE_TASTING_LAUNCHED); objeví se, jakmile jsou v DB
// balení ochutnávky (SQL 135).

// Spuštěno 20. 11. 2026 večer (Lucie: „nečekejme na test trvanlivosti, zapnout hned“).
export const CAFE_TASTING_LAUNCHED = true;
export const CAFE_TASTING_PREVIEW_COOKIE = "begina_nahled";
export const CAFE_TASTING_PREVIEW_VALUE = "ochutnavka-provoz-8m2x";

export const CAFE_TASTING_SLUG = "ochutnavka-do-provozu";
export const CAFE_TASTING_CATEGORY = "ochutnavka-provoz";
export const CAFE_TASTING_SKU_PREFIX = "ochutnavka-";
export const CAFE_TASTING_PRICE_KC = 49;
export const CAFE_TASTING_LEAD_SOURCE = "web_ochutnavka";

export type CafeTastingKind = "polevka" | "sirup" | "svarak" | "koktejl";
export type CafeTastingItem = { sku: string; productSlug: string; name: string; kind: CafeTastingKind; volumeMl: number; weightGrams: number };

const soup = (productSlug: string, name: string): CafeTastingItem => ({ sku: `${CAFE_TASTING_SKU_PREFIX}polevka-${productSlug}`, productSlug, name, kind: "polevka", volumeMl: 200, weightGrams: 250 });
// Svařák Deluxe 200 ml za 49 Kč (Lucie 20. 11. 2026), stejný sáček jako polévky, 18+.
const mulled = (productSlug: string, name: string): CafeTastingItem => ({ sku: `${CAFE_TASTING_SKU_PREFIX}svarak-${productSlug}`, productSlug, name, kind: "svarak", volumeMl: 200, weightGrams: 250 });
// Lady Carneval 200 ml za 49 Kč (vlákno Ceny malých balení, 22. 11. 2026), 18+.
const cocktail = (productSlug: string, name: string): CafeTastingItem => ({ sku: `${CAFE_TASTING_SKU_PREFIX}koktejl-${productSlug}`, productSlug, name, kind: "koktejl", volumeMl: 200, weightGrams: 250 });
const syrup = (productSlug: string, name: string): CafeTastingItem => ({ sku: `${CAFE_TASTING_SKU_PREFIX}sirup-${productSlug}`, productSlug, name, kind: "sirup", volumeMl: 100, weightGrams: 140 });

/** Názvy přesně podle e-shopu; hmotnosti zadala Lucie (polévka 0,25 kg, sirup 0,14 kg). */
export const CAFE_TASTING_ITEMS: readonly CafeTastingItem[] = [
  soup("dynova-polevka", "Dýňová polévka"),
  soup("kulajda", "Kulajda"),
  soup("rajcatova-polevka", "Tomatová polévka"),
  soup("rajcatova-polevka-s-cervenou-repou", "Rajčatová polévka s červenou řepou"),
  soup("gulasova-polevka-z-hlivy-ustricne", "Gulášová polévka z hlívy ústřičné"),
  soup("spenatova-polevka", "Špenátová polévka"),
  syrup("bylinny-sirup-saman", "Bylinný sirup Šaman"),
  syrup("lipovy-sirup", "Lipový sirup"),
  syrup("zazvorovy-sirup", "Zázvorový sirup"),
  syrup("ibiskovy-sirup", "Ibiškový sirup"),
  syrup("sipkovy-sirup", "Šípkový sirup"),
  syrup("hermankovy-sirup", "Heřmánkový sirup"),
  syrup("medunkovy-sirup-s-levanduli", "Meduňkový sirup s levandulí"),
  mulled("svarak-deluxe", "Svařák Deluxe"),
  cocktail("lady-carneval", "Lady Carneval"),
];

/** Alkoholické položky ochutnávky — v pokladně vyžadují potvrzení věku 18+. */
export function isCafeTastingAlcohol(sku: string): boolean {
  return CAFE_TASTING_ITEMS.some((item) => item.sku === sku && (item.kind === "svarak" || item.kind === "koktejl"));
}

const SKUS = new Set(CAFE_TASTING_ITEMS.map((item) => item.sku));

export function isCafeTastingSku(sku: string): boolean {
  return SKUS.has(sku);
}
export function isCafeTasting(product: { slug: string }): boolean {
  return product.slug === CAFE_TASTING_SLUG;
}
export function cartHasCafeTasting(cart: readonly { sku: string }[]): boolean {
  return cart.some((line) => isCafeTastingSku(line.sku));
}

/** Z každé položky ochutnávky nejvýš 1 kus. */
export const CAFE_TASTING_MAX_PER_ITEM = 1;

// 22. 11. 2026 (Lucie): vzorky jen k objednávce aspoň jedné beginy 3 l; k první
// objednávce na IČO jsou 2 polévky + 2 sirupy zdarma, další vzorky po 49 Kč.
// Samostatná placená ochutnávka bez beginy už není.
export const CAFE_TASTING_FREE = { polevka: 2, sirup: 2 } as const;
export const CAFE_TASTING_NEEDS_BEGINA = "Vzorky přidáváme k objednávce aspoň jedné beginy 3 l polévky, sirupu nebo koktejlu. Přidejte si ji prosím do košíku.";
/** Ke kterým beginám 3 l jdou vzorky: polévky, sirupy, koktejly (čaje a ovocné nápoje ne — nízká marže, Lucie 22. 11. 2026). */
export const CAFE_TASTING_BEGINA_CATEGORIES: readonly string[] = ["polevky", "sirupy", "koktejly"];
/** Z koktejlů jen Svařák Deluxe a Lady Carneval (Lucie 22. 11. 2026: Granátový Bond a Kosmopolitan ne). */
export const CAFE_TASTING_COCKTAIL_BEGINAS: readonly string[] = ["svarak-deluxe", "lady-carneval"];
export function isTastingBegina(product: { category: string; slug?: string }, variant: { volumeMl: number | null }): boolean {
  if (variant.volumeMl !== 3000 || !CAFE_TASTING_BEGINA_CATEGORIES.includes(product.category)) return false;
  return product.category !== "koktejly" || (product.slug !== undefined && CAFE_TASTING_COCKTAIL_BEGINAS.includes(product.slug));
}

/** Je vzorek zdarma-kandidát (polévka/sirup), nebo vždy za 49 Kč (koktejly)? */
export function tastingFreeKind(sku: string): "polevka" | "sirup" | null {
  const item = CAFE_TASTING_ITEMS.find((candidate) => candidate.sku === sku);
  return item && (item.kind === "polevka" || item.kind === "sirup") ? item.kind : null;
}

/** Které vzorky jsou zdarma: první 2 polévky a první 2 sirupy (v pořadí výběru). */
export function freeTastingSkus(skus: readonly string[]): Set<string> {
  const free = new Set<string>();
  const used = { polevka: 0, sirup: 0 };
  for (const sku of skus) {
    const item = CAFE_TASTING_ITEMS.find((candidate) => candidate.sku === sku);
    if (!item || item.kind === "svarak" || item.kind === "koktejl") continue;
    if (used[item.kind] < CAFE_TASTING_FREE[item.kind]) {
      used[item.kind] += 1;
      free.add(sku);
    }
  }
  return free;
}

/** Součet za vybrané vzorky (bez dopravy) — zdarma 2 polévky + 2 sirupy, ostatní po 49 Kč. */
export function cafeTastingTotalKc(skus: readonly string[]): number {
  const unique = [...new Set(skus.filter(isCafeTastingSku))];
  const free = freeTastingSkus(unique);
  return unique.filter((sku) => !free.has(sku)).length * CAFE_TASTING_PRICE_KC;
}

// Texty (vykání, bez zdravotních tvrzení).
export const CAFE_TASTING_HEADING = "První objednávka: 1 begina + 4 vzorky zdarma";
export const CAFE_TASTING_INTRO = "Vyberte si 1 beginu 3 l a k ní 2 polévky a 2 sirupy na ochutnání zdarma. Zelené jsou zdarma, každý další vzorek je za 49 Kč. Z každého vzorku nejvýš 1 kus, jedna nabídka na jedno IČO.";
export const CAFE_TASTING_BEGINA_HEADING = "1. Vaše begina 3 l";
export const CAFE_TASTING_NEED_BEGINA_PICK = "Vyberte prosím beginu, ke které vzorky přibalíme.";
export const CAFE_TASTING_SOUPS_HEADING = "2. Vzorky polévek 200 ml – 2 zdarma";
export const CAFE_TASTING_SYRUPS_HEADING = "3. Vzorky sirupů 100 ml – 2 zdarma";
export const CAFE_TASTING_MULLED_HEADING = "4. Vzorky koktejlů 200 ml – po 49 Kč (jen pro osoby starší 18 let)";
/** Lucie 22. 11. 2026: vzorky ostatních nápojů jen po domluvě. */
export const CAFE_TASTING_OTHER_SAMPLES = "Vzorky čajů, ovocných nápojů a dalších koktejlů po domluvě – napište nám na info@begina.cz nebo nám níže nechte telefon.";
export const CAFE_TASTING_DELIVERY = "Doprava chlazenou přepravou podle ceníku dopravy, nebo osobní odběr ve Viticích.";
export const CAFE_TASTING_ICO_NOTE = "Nabídka je pro kavárny a bistra – objednává se na firmu s IČO, jedna na jedno IČO.";
export const CAFE_TASTING_ALREADY = "Vzorky zdarma k první objednávce už jste na toto IČO objednali. Beginy si můžete objednat běžně v e-shopu.";
export const CAFE_TASTING_NEED_ITEM = "Vyberte prosím aspoň 1 vzorek.";
export const CAFE_TASTING_NEED_COMPANY = "Ochutnávku do provozu objednáváte na firmu – zaškrtněte prosím „Nakupuji na firmu“ a vyplňte název a IČO.";
export const CAFE_TASTING_ONE_EACH = "Z každé položky ochutnávky lze objednat nejvýš 1 kus.";
export const CAFE_TASTING_NO_ZASILKOVNA = "Ochutnávku do provozu posíláme jen chlazenou přepravou, nebo si ji vyzvednete osobně ve Viticích.";
export const CAFE_TASTING_CHECKOUT_NOTE = "Vzorky k první objednávce: objednáváte na firmu s IČO (jednou na jedno IČO), 2 polévky + 2 sirupy zdarma. Doprava chlazenou přepravou, nebo osobní odběr ve Viticích.";
/** Dosavadní formulář zůstává jako druhá možnost (Lucie 20. 11. 2026). */
// Dokument ChatGPT (Lucie 22. 11. 2026): krátká poptávka po telefonu.
export const CAFE_TASTING_FORM_HEADING = "Domluvíme dodávky do Vaší kavárny";
export const CAFE_CALLBACK_TEXT = "Nechte nám na sebe telefon. Do dvou dnů Vám zavoláme a probereme, které polévky a nápoje chcete vyzkoušet a kam je potřebujete doručit.";

/**
 * VOLITELNĚ — zatím vypnuto, zapne se po rozhodnutí (Lucie 20. 11. 2026):
 * text o odečtení ceny ochutnávky z první objednávky a slevový kód na hodnotu
 * ochutnávky (bez dopravy), poslaný e-mailem po doručení, platný 60 dní, jen pro
 * stejné IČO.
 */
export const CAFE_TASTING_CREDIT_ENABLED = false;
export const CAFE_TASTING_CREDIT_TEXT = "Cenu ochutnávky vám odečteme z první objednávky.";
export const CAFE_TASTING_CREDIT_VALID_DAYS = 60;

export type CafeTastingCredit = { ico: string; amountKc: number; validUntil: Date };

/** Parametry slevového kódu za ochutnávku: hodnota zboží ochutnávky (bez dopravy), 60 dní od doručení, jen pro IČO. */
export function cafeTastingCredit(input: { ico: string; tastingGoodsKc: number; deliveredAt: Date }): CafeTastingCredit | null {
  if (!CAFE_TASTING_CREDIT_ENABLED || input.tastingGoodsKc <= 0) return null;
  const validUntil = new Date(input.deliveredAt.getTime() + CAFE_TASTING_CREDIT_VALID_DAYS * 24 * 60 * 60 * 1000);
  return { ico: input.ico, amountKc: input.tastingGoodsKc, validUntil };
}

/** Údaje o firmě z výběru ochutnávky (IČO ověřené v ARES) — předvyplní se v pokladně. */
export type CafeTastingCompany = { venue: string; company: string; ico: string; dic: string | null; street: string; city: string; zip: string };
export const CAFE_TASTING_COMPANY_STORAGE = "begina_ochutnavka_firma";

export function parseCafeTastingCompany(raw: string | null): CafeTastingCompany | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof CafeTastingCompany, unknown>>;
    const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 200) : "");
    if (!/^\d{8}$/.test(text(data.ico))) return null;
    return {
      venue: text(data.venue),
      company: text(data.company),
      ico: text(data.ico),
      dic: text(data.dic) || null,
      street: text(data.street),
      city: text(data.city),
      zip: text(data.zip),
    };
  } catch {
    return null;
  }
}

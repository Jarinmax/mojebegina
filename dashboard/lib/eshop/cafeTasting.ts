// Ochutnávka do provozu — jen pro kavárny a bistra (zadání Lucie 20. 11. 2026).
// Čistá pravidla bez DB a bez Reactu.
//
// V DB je to jeden produkt (CAFE_TASTING_SLUG) ve vlastní kategorii a 13 balení:
// 6 polévek po 200 ml a 7 sirupů po 100 ml, každé za 49 Kč. Provoz si na stránce
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
// Trvanlivost polévky v sáčku 200 ml se zatím nevypisuje (Lucie doplní po testu),
// proto je ochutnávka do té doby schovaná (CAFE_TASTING_LAUNCHED) a vidí ji jen
// náhled s cookie (stejný mechanismus jako u setu sirupů).

export const CAFE_TASTING_LAUNCHED = false;
export const CAFE_TASTING_PREVIEW_COOKIE = "begina_nahled";
export const CAFE_TASTING_PREVIEW_VALUE = "ochutnavka-provoz-8m2x";

export const CAFE_TASTING_SLUG = "ochutnavka-do-provozu";
export const CAFE_TASTING_CATEGORY = "ochutnavka-provoz";
export const CAFE_TASTING_SKU_PREFIX = "ochutnavka-";
export const CAFE_TASTING_PRICE_KC = 49;
export const CAFE_TASTING_LEAD_SOURCE = "web_ochutnavka";

export type CafeTastingKind = "polevka" | "sirup";
export type CafeTastingItem = { sku: string; productSlug: string; name: string; kind: CafeTastingKind; volumeMl: number; weightGrams: number };

const soup = (productSlug: string, name: string): CafeTastingItem => ({ sku: `${CAFE_TASTING_SKU_PREFIX}polevka-${productSlug}`, productSlug, name, kind: "polevka", volumeMl: 200, weightGrams: 250 });
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
];

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

/** Součet za vybrané položky (bez dopravy). */
export function cafeTastingTotalKc(skus: readonly string[]): number {
  return new Set(skus.filter(isCafeTastingSku)).size * CAFE_TASTING_PRICE_KC;
}

// Texty (vykání, bez zdravotních tvrzení).
export const CAFE_TASTING_HEADING = "Objednejte si ochutnávku do podniku";
export const CAFE_TASTING_INTRO = "Vyberte si, co chcete ochutnat. Z každé polévky a sirupu nejvýš 1 kus.";
export const CAFE_TASTING_SOUPS_HEADING = "Polévky – 200 ml ve stříbrném sáčku se šroubovacím uzávěrem, 49 Kč za kus";
export const CAFE_TASTING_SYRUPS_HEADING = "Sirupy – 100 ml v sáčku se šroubovacím uzávěrem, 49 Kč za kus";
export const CAFE_TASTING_DELIVERY = "Doprava chlazenou přepravou podle ceníku dopravy, nebo osobní odběr ve Viticích.";
export const CAFE_TASTING_ICO_NOTE = "Ochutnávka je jen pro kavárny a bistra – objednává se na firmu s IČO, jedna na jedno IČO.";
export const CAFE_TASTING_ALREADY = "Ochutnávku jste už objednali, ozveme se vám.";
export const CAFE_TASTING_NEED_ITEM = "Vyberte prosím aspoň 1 položku.";
export const CAFE_TASTING_NEED_COMPANY = "Ochutnávku do provozu objednáváte na firmu – zaškrtněte prosím „Nakupuji na firmu“ a vyplňte název a IČO.";
export const CAFE_TASTING_ONE_EACH = "Z každé položky ochutnávky lze objednat nejvýš 1 kus.";
export const CAFE_TASTING_NO_ZASILKOVNA = "Ochutnávku do provozu posíláme jen chlazenou přepravou, nebo si ji vyzvednete osobně ve Viticích.";
export const CAFE_TASTING_CHECKOUT_NOTE = "Ochutnávka do provozu: objednáváte na firmu s IČO (jedna ochutnávka na jedno IČO). Doprava chlazenou přepravou, nebo osobní odběr ve Viticích.";
/** Dosavadní formulář zůstává jako druhá možnost (Lucie 20. 11. 2026). */
export const CAFE_TASTING_FORM_HEADING = "Chcete ochutnávku přivézt? Napište nám";

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

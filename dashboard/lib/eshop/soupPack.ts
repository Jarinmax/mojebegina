// Ochutnávka polévek 3 × 450 ml (Lucie a ChatGPT 24. 11. 2026) — čistá pravidla bez DB a bez Reactu.
//
// Jeden produkt v kategorii Polévky (SQL 149), jedno balení za 299 Kč + doprava.
// Zákazník vybere tři RŮZNÉ polévky; výběr se nese v řádku košíku jako přípona SKU
// (stejně jako u setu sirupů): „polevky-3x450~dy.ku.to“. Do objednávky se ukládá
// SKU bez přípony a výběr je v názvu položky.
//
// Bez IČO a bez limitu — kavárna i domácnost si ji může koupit opakovaně. Nic nemění
// na dárku k první begině 3 l (ten se počítá jen ze vzorků zdarma).
// Doprava: chlazená přeprava nebo osobní odběr ve Viticích (Zásilkovna ne).
// Průhledný sáček 500 ml, plní se 450 ml (Lucie 24. 11. 2026).

export const SOUP_PACK_SLUG = "ochutnavka-polevek-3x450";
export const SOUP_PACK_SKU = "polevky-3x450";
export const SOUP_PACK_SIZE = 3;
export const SOUP_PACK_FILL_ML = 450;
const SEPARATOR = "~";

export const SOUP_PACK_SOUPS = [
  { code: "dy", slug: "dynova-polevka", name: "Dýňová polévka" },
  { code: "ku", slug: "kulajda", name: "Kulajda" },
  { code: "to", slug: "rajcatova-polevka", name: "Tomatová polévka" },
  { code: "rr", slug: "rajcatova-polevka-s-cervenou-repou", name: "Rajčatová polévka s červenou řepou" },
  { code: "gu", slug: "gulasova-polevka-z-hlivy-ustricne", name: "Gulášová polévka z hlívy ústřičné" },
  { code: "sp", slug: "spenatova-polevka", name: "Špenátová polévka" },
] as const;
export type SoupPackCode = (typeof SOUP_PACK_SOUPS)[number]["code"];

const BY_CODE = new Map<string, (typeof SOUP_PACK_SOUPS)[number]>(SOUP_PACK_SOUPS.map((soup) => [soup.code, soup]));

export function isSoupPack(product: { slug: string }): boolean {
  return product.slug === SOUP_PACK_SLUG;
}
export function soupPackBaseSku(sku: string): string {
  const at = sku.indexOf(SEPARATOR);
  return at === -1 ? sku : sku.slice(0, at);
}
export function isSoupPackSku(sku: string): boolean {
  return soupPackBaseSku(sku) === SOUP_PACK_SKU;
}

/** Platný výběr = přesně tři RŮZNÉ polévky. */
export function validSoupChoice(codes: readonly string[]): codes is SoupPackCode[] {
  return codes.length === SOUP_PACK_SIZE && new Set(codes).size === SOUP_PACK_SIZE && codes.every((code) => BY_CODE.has(code));
}

/** SKU řádku košíku; null = výběr není úplný. Pořadí podle nabídky (stejný výběr = stejný řádek). */
export function soupPackCartSku(codes: readonly string[]): string | null {
  if (!validSoupChoice(codes)) return null;
  const ordered = SOUP_PACK_SOUPS.map((soup) => soup.code).filter((code) => codes.includes(code));
  return `${SOUP_PACK_SKU}${SEPARATOR}${ordered.join(".")}`;
}

export function soupChoiceFromSku(sku: string): SoupPackCode[] | null {
  if (!isSoupPackSku(sku)) return null;
  const at = sku.indexOf(SEPARATOR);
  if (at === -1) return null;
  const codes = sku.slice(at + 1).split(".");
  return validSoupChoice(codes) ? codes : null;
}

/** „Vaše polévky: Dýňová polévka, Kulajda a Tomatová polévka.“ */
export function soupChoiceLine(sku: string): string | null {
  const codes = soupChoiceFromSku(sku);
  if (!codes) return null;
  const names = codes.map((code) => BY_CODE.get(code)!.name);
  return `Vaše polévky: ${names.slice(0, -1).join(", ")} a ${names[names.length - 1]}.`;
}

/** Název do košíku a objednávky: „Ochutnávka polévek 3 × 450 ml (Dýňová polévka, Kulajda, Tomatová polévka)“. */
export function withSoupChoice(name: string, sku: string): string {
  const codes = soupChoiceFromSku(sku);
  return codes ? `${name} (${codes.map((code) => BY_CODE.get(code)!.name).join(", ")})` : name;
}

// Texty (zadání Lucie 24. 11. 2026)
export const SOUP_PACK_TITLE = "Ochutnávka polévek 3 × 450 ml";
export const SOUP_PACK_TEXT = "Vyberte si tři různé polévky. Z každého sáčku připravíte dvě menší porce po 225 ml.";
export const SOUP_PACK_BUTTON = "Vybrat 3 polévky";
export const SOUP_PACK_ADD = "Přidat ochutnávku do košíku";
export const SOUP_PACK_PICKUP_LABEL = "Osobní odběr ve Viticích";
export const SOUP_PACK_DELIVERY_LABEL = "Včetně chlazené dopravy";
export const SOUP_PACK_NEEDS_CHOICE = "U ochutnávky polévek vyberte prosím tři různé polévky.";
export const SOUP_PACK_NO_ZASILKOVNA = "Ochutnávku polévek posíláme jen chlazenou přepravou, nebo si ji vyzvednete osobně ve Viticích.";
export const SOUP_PACK_LINK_QUESTION = "Chcete nejdřív ochutnat?";

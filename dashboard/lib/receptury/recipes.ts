// RECEPTURY A NÁKLADY 1.0 — čisté výpočty (bez databáze). Množství jsou na
// jednu výrobní dávku (batchMl, dnes vždy 3 l = jedna begina). Cena suroviny
// je za kg / l / kus / kapku; gramy a mililitry se převádějí na kg a litry.

export const RECIPE_CATEGORIES = [
  { key: "sirupy", label: "Sirupy" },
  { key: "caje", label: "Čaje" },
  { key: "ovocne-napoje", label: "Ovocné nápoje" },
  { key: "polevky", label: "Polévky" },
  { key: "koktejly", label: "Alkoholické koktejly" },
] as const;

export type PriceUnit = "kg" | "l" | "ks" | "kapka";
export type ItemUnit = "g" | "ml" | "l" | "kapka" | "ks";

export type RecipeIngredient = { id: string; kind: "surovina" | "obal"; code: string; name: string; priceUnit: PriceUnit; priceKc: number; note: string | null };
export type RecipeItem = { ingredient: RecipeIngredient; quantity: number; unit: ItemUnit };
export type RecipeVariant = { label: string; volumeMl: number; packagingCodes: string[]; salePriceHal: number | null };
export type Recipe = { slug: string; category: string; name: string; batchMl: number; note: string | null; archived: boolean; items: RecipeItem[]; variants: RecipeVariant[] };

// Prodejní cena receptury = cena na e-shopu (27. 11. 2026, Lucie: „ať se to
// sjednotí“). Když má výrobek na e-shopu aktivní balení stejného objemu, platí
// jeho cena pro všechny varianty toho objemu (s krabicí i bez). Výrobky, které
// na e-shopu nejsou, si nechávají cenu z receptury.
export const ESHOP_SLUG_ALIASES: Record<string, string> = {
  "malinovy-svarak": "malinovy-svarak-nealko",
  "saman-sirup": "bylinny-sirup-saman",
  "gulasova-polevka-z-hlivy": "gulasova-polevka-z-hlivy-ustricne",
  "rajcatova-polevka-s-repou": "rajcatova-polevka-s-cervenou-repou",
  "tomatova-polevka": "rajcatova-polevka",
  cosmopolitan: "kosmopolitan",
};

export function eshopPriceKey(productSlug: string, volumeMl: number): string {
  return `${productSlug}|${volumeMl}`;
}

/** eshopPrices: klíč eshopPriceKey → cena v Kč (jen aktivní výrobky a balení). */
export function applyEshopPrices(recipeSlug: string, variants: RecipeVariant[], eshopPrices: Map<string, number>): RecipeVariant[] {
  const productSlug = ESHOP_SLUG_ALIASES[recipeSlug] ?? recipeSlug;
  return variants.map((variant) => {
    const priceKc = eshopPrices.get(eshopPriceKey(productSlug, variant.volumeMl));
    return priceKc === undefined ? variant : { ...variant, salePriceHal: Math.round(priceKc * 100) };
  });
}

/** Množství převedené na jednotku, ve které je cena (g → kg, ml → l). */
export function quantityInPriceUnit(quantity: number, unit: ItemUnit): number {
  return unit === "g" || unit === "ml" ? quantity / 1000 : quantity;
}

export function itemCostKc(item: RecipeItem): number {
  return quantityInPriceUnit(item.quantity, item.unit) * item.ingredient.priceKc;
}

/** Náklad na suroviny jedné dávky (jedné 3l beginy). */
export function batchCostKc(recipe: Pick<Recipe, "items">): number {
  return recipe.items.reduce((sum, item) => sum + itemCostKc(item), 0);
}

export type VariantCalc = {
  label: string;
  volumeMl: number;
  contentKc: number;
  packagingKc: number;
  totalKc: number;
  saleKc: number | null;
  marginKc: number | null;
  marginPct: number | null;
  /** Kódy obalů, které v ceníku chybí — náklad pak není úplný. */
  missingPackaging: string[];
};

export function calcVariant(recipe: Pick<Recipe, "items" | "batchMl">, variant: RecipeVariant, packagingPriceByCode: ReadonlyMap<string, number>): VariantCalc {
  const contentKc = recipe.batchMl > 0 ? (batchCostKc(recipe) * variant.volumeMl) / recipe.batchMl : 0;
  const missingPackaging = variant.packagingCodes.filter((code) => !packagingPriceByCode.has(code));
  const packagingKc = variant.packagingCodes.reduce((sum, code) => sum + (packagingPriceByCode.get(code) ?? 0), 0);
  const totalKc = contentKc + packagingKc;
  const saleKc = variant.salePriceHal === null ? null : variant.salePriceHal / 100;
  const marginKc = saleKc === null ? null : saleKc - totalKc;
  const marginPct = saleKc === null || saleKc <= 0 || marginKc === null ? null : (marginKc / saleKc) * 100;
  return { label: variant.label, volumeMl: variant.volumeMl, contentKc, packagingKc, totalKc, saleKc, marginKc, marginPct, missingPackaging };
}

/** "44,32" / "1 361" / "0,157 Kč" → číslo; záporné a nesmysly → null. Nula je povolená. */
export function parsePriceKc(input: string): number | null {
  const cleaned = input.replace(/kč/i, "").replace(/[\s ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 && value < 100_000_000 ? value : null;
}

/** Počet begin pro přepočet množství: celé číslo 1–200, jinak 1. */
export function parseBatchCount(input: string | undefined): number {
  const value = Number(input ?? "");
  return Number.isInteger(value) && value >= 1 && value <= 200 ? value : 1;
}

export function formatKcValue(kc: number): string {
  return `${kc.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
}

/** Cena v ceníku: až 4 desetinná místa (kapky, voda), bez zbytečných nul. */
export function formatUnitPrice(kc: number): string {
  return kc.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** Množství do receptury; od 1 000 g / ml výš přidá i kg / l. */
export function formatQuantity(quantity: number, unit: ItemUnit): string {
  const text = `${quantity.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} ${unit === "kapka" ? "kapek" : unit}`;
  if ((unit === "g" || unit === "ml") && quantity >= 1000) {
    return `${text} (${(quantity / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 3 })} ${unit === "g" ? "kg" : "l"})`;
  }
  return text;
}

export function priceUnitLabel(unit: PriceUnit): string {
  return unit === "kapka" ? "Kč/kapka" : `Kč/${unit}`;
}

// NÁKUPY SUROVIN 1.0 — nabídky dodavatelů (balení, cena, doprava, odkaz).
export type RecipeOffer = {
  id: string;
  ingredientId: string | null;
  itemName: string;
  url: string | null;
  packLabel: string;
  /** Balení v jednotce ceny suroviny (kg / l / ks / kapka). */
  packQty: number;
  priceKc: number;
  shippingKc: number;
  /** true = do nákladů se nepočítá (akční cena nebo balení, které nebereme). Sloupec is_promo. */
  isPromo: boolean;
  note: string | null;
};

/** Cena za jednotku včetně dopravy: (cena + doprava) / balení, na 4 desetinná místa. */
export function offerUnitPriceKc(offer: Pick<RecipeOffer, "packQty" | "priceKc" | "shippingKc">): number {
  if (!(offer.packQty > 0)) return 0;
  return Math.round(((offer.priceKc + offer.shippingKc) / offer.packQty) * 10_000) / 10_000;
}

/** Nabídka, podle které se dnes počítá (cena v ceníku = její cena za jednotku, ±0,005 Kč). */
export function isOfferInUse(offer: Pick<RecipeOffer, "packQty" | "priceKc" | "shippingKc">, ingredientPriceKc: number): boolean {
  return Math.abs(offerUnitPriceKc(offer) - ingredientPriceKc) < 0.005;
}

/** Nejnižší běžná (ne akční) cena za jednotku z nabídek, nebo null. */
export function lowestRegularUnitPriceKc(offers: readonly RecipeOffer[]): number | null {
  const prices = offers.filter((offer) => !offer.isPromo).map(offerUnitPriceKc);
  return prices.length ? Math.min(...prices) : null;
}

/** Odkaz jen http(s); cokoli jiného → null (aby se do stránky nedostal javascript: apod.). */
export function safeOfferUrl(input: string | null | undefined): string | null {
  const value = (input ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Náklad na beginu (jednu dávku) u receptur, kterých se týká změna ceny jedné suroviny. */
export function priceChangeImpact(
  recipes: readonly Pick<Recipe, "name" | "archived" | "items">[],
  ingredientId: string,
  newPriceKc: number
): { name: string; beforeKc: number; afterKc: number; diffKc: number }[] {
  return recipes
    .filter((recipe) => !recipe.archived && recipe.items.some((item) => item.ingredient.id === ingredientId))
    .map((recipe) => {
      const beforeKc = batchCostKc(recipe);
      const afterKc = batchCostKc({
        items: recipe.items.map((item) => (item.ingredient.id === ingredientId ? { ...item, ingredient: { ...item.ingredient, priceKc: newPriceKc } } : item)),
      });
      const round = (kc: number) => Math.round(kc * 100) / 100;
      return { name: recipe.name, beforeKc: round(beforeKc), afterKc: round(afterKc), diffKc: round(afterKc - beforeKc) };
    });
}

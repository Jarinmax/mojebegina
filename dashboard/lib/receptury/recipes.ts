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

// Řádky „Příprava“ a „Vrácení a reklamace“ v tabulce Informace o potravině
// podle kategorie. Jen polévky a sirupy; ostatní kategorie je nemají.
import type { FoodInfo } from "./types";
import { SOUP_CATEGORY, SOUP_PREPARATION, SOUP_RETURNS_AFTER, SOUP_RETURNS_BEFORE, SOUP_RETURNS_LINK_TEXT } from "./soupFoodInfo";
import { SYRUP_CATEGORY, SYRUP_PREPARATION, SYRUP_RETURNS_AFTER, SYRUP_RETURNS_BEFORE, SYRUP_RETURNS_LINK_TEXT } from "./syrupFoodInfo";

const EXTRAS: Record<string, Pick<FoodInfo, "preparation" | "returns">> = {
  [SOUP_CATEGORY]: {
    preparation: SOUP_PREPARATION,
    returns: { before: SOUP_RETURNS_BEFORE, linkText: SOUP_RETURNS_LINK_TEXT, after: SOUP_RETURNS_AFTER },
  },
  [SYRUP_CATEGORY]: {
    preparation: SYRUP_PREPARATION,
    returns: { before: SYRUP_RETURNS_BEFORE, linkText: SYRUP_RETURNS_LINK_TEXT, after: SYRUP_RETURNS_AFTER },
  },
};

export function categoryFoodExtras(category: string): Pick<FoodInfo, "preparation" | "returns"> {
  return EXTRAS[category] ?? {};
}

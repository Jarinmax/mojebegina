// Řádky „Příprava“ a „Vrácení a reklamace“ v tabulce Informace o potravině
// podle kategorie (polévky, sirupy) a u vybraných produktů podle zadání
// (koktejly Svařák Deluxe, Lady Carneval, Granátový bond a Kosmopolitan, 10. 11. 2026;
// ovocné nápoje Dům u jezera, Červánkové nebe, Malinový svařák nealko, 11. 11. 2026). Ostatní je nemají.
import type { FoodInfo } from "./types";
import { SOUP_CATEGORY, SOUP_PREPARATION, SOUP_RETURNS_AFTER, SOUP_RETURNS_BEFORE, SOUP_RETURNS_LINK_TEXT } from "./soupFoodInfo";
import { SYRUP_CATEGORY, SYRUP_PREPARATION, SYRUP_RETURNS_AFTER, SYRUP_RETURNS_BEFORE, SYRUP_RETURNS_LINK_TEXT } from "./syrupFoodInfo";

const EXTRAS: Record<string, Pick<FoodInfo, "preparation" | "returns">> = {
  [SOUP_CATEGORY]: {
    preparation: SOUP_PREPARATION,
    returns: { before: SOUP_RETURNS_BEFORE, linkText: SOUP_RETURNS_LINK_TEXT, after: SOUP_RETURNS_AFTER },
  },
  // Čaje (11. 11. 2026) — rychle se kazí, proto stejné vrácení jako polévky.
  caje: {
    preparation:
      "Před použitím protřepejte. Podávejte vychlazené nebo teplé (šetrně ohřejte, nepřivádějte k varu). Nápoj je připravený k podávání, neředí se.",
    returns: { before: SOUP_RETURNS_BEFORE, linkText: SOUP_RETURNS_LINK_TEXT, after: SOUP_RETURNS_AFTER },
  },
  [SYRUP_CATEGORY]: {
    preparation: SYRUP_PREPARATION,
    returns: { before: SYRUP_RETURNS_BEFORE, linkText: SYRUP_RETURNS_LINK_TEXT, after: SYRUP_RETURNS_AFTER },
  },
};

/** Text „Vrácení a reklamace“ u koktejlů (zadání 10. 11. 2026, doslova). */
export const COCKTAIL_RETURNS = {
  before:
    "Vadný nebo poškozený výrobek můžete reklamovat. Kontaktujte nás na info@begina.cz. Podrobnosti o odstoupení od kupní smlouvy a reklamacích najdete v ",
  linkText: "obchodních podmínkách",
  after: ". Vaše zákonná práva tím nejsou dotčena.",
};

/** Ovocné nápoje (11. 11. 2026) — rychle se kazí, proto stejné „Vrácení a reklamace“ jako polévky. */
const FRUIT_RETURNS = { before: SOUP_RETURNS_BEFORE, linkText: SOUP_RETURNS_LINK_TEXT, after: SOUP_RETURNS_AFTER };
const FRUIT_SHAKE = "Před použitím protřepejte, usazenina z ovoce je přirozená.";

const PRODUCT_EXTRAS: Record<string, Pick<FoodInfo, "preparation" | "returns">> = {
  "svarak-deluxe": {
    preparation: "Před podáváním šetrně ohřejte. Nepřivádějte k varu. Nápoj je připravený k podávání, neředí se.",
    returns: COCKTAIL_RETURNS,
  },
  "granatovy-bond": {
    preparation: "Podávejte vychlazené, případně s ledem. Nápoj je připravený k podávání, neředí se.",
    returns: COCKTAIL_RETURNS,
  },
  kosmopolitan: {
    preparation: "Podávejte vychlazené, případně s ledem. Nápoj je připravený k podávání, neředí se.",
    returns: COCKTAIL_RETURNS,
  },
  "dum-u-jezera": {
    preparation: `${FRUIT_SHAKE} Podávejte vychlazené, případně s ledem. Nápoj je připravený k podávání, neředí se.`,
    returns: FRUIT_RETURNS,
  },
  "cervankove-nebe": {
    preparation: `${FRUIT_SHAKE} Podávejte vychlazené, případně s ledem. Nápoj je připravený k podávání, neředí se.`,
    returns: FRUIT_RETURNS,
  },
  "malinovy-svarak-nealko": {
    preparation: `${FRUIT_SHAKE} Podávejte teplé (šetrně ohřejte, nepřivádějte k varu) nebo vychlazené. Nápoj je připravený k podávání, neředí se.`,
    returns: FRUIT_RETURNS,
  },
  "lady-carneval": {
    preparation: "Podávejte vychlazené, případně s ledem. Nápoj je připravený k podávání, neředí se.",
    returns: COCKTAIL_RETURNS,
  },
};

export function categoryFoodExtras(category: string, slug?: string): Pick<FoodInfo, "preparation" | "returns"> {
  return (slug ? PRODUCT_EXTRAS[slug] : undefined) ?? EXTRAS[category] ?? {};
}

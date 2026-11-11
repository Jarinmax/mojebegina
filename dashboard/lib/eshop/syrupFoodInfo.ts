// Společná šablona „Informace o potravině“ pro bylinné sirupy (9. 11. 2026,
// texty doslova podle zadání). Skladování a trvanlivost se ukládají i do
// produktů v DB (skript 80), příprava a vrácení/reklamace se doplňují podle
// kategorie (categoryFoodInfo.ts). Tři měsíce po otevření jsou údaj
// potvrzený výrobcem — žádné další lhůty se neodvozují.
//
// Výjimka z vrácení po porušení hygienického uzávěru se zatím NEUVÁDÍ
// (provedení ochranných pojistek u obou balení není potvrzené) a zákaz
// vrácení rychle se kazících polévek se na sirupy nevztahuje.

export const SYRUP_CATEGORY = "sirupy";

export const SYRUP_STORAGE =
  "Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.";

export const SYRUP_SHELF_LIFE =
  "Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.";

export const SYRUP_PREPARATION =
  "Před použitím protřepejte. Doporučené ředění je 1 díl sirupu na 10 dílů vody. Intenzitu chuti upravte podle sebe.";

export const SYRUP_RETURNS_BEFORE =
  "U neotevřeného sirupu můžete odstoupit od kupní smlouvy do 14 dnů od převzetí. Právo reklamovat vadné zboží tím není dotčeno. Podrobnosti o odstoupení a reklamacích najdete v ";
export const SYRUP_RETURNS_LINK_TEXT = "obchodních podmínkách";
export const SYRUP_RETURNS_AFTER = ".";
export const SYRUP_RETURNS_TEXT = `${SYRUP_RETURNS_BEFORE}${SYRUP_RETURNS_LINK_TEXT}${SYRUP_RETURNS_AFTER}`;

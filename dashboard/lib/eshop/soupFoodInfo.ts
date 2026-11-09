// Společná šablona „Informace o potravině“ pro polévky (majitel, 9. 11. 2026).
// Platí pro všech 6 polévek; texty skladování a trvanlivosti se ukládají
// i do produktů v DB (skript 77), příprava a vrácení/reklamace se doplňují
// tady podle kategorie. Ostatní kategorie se nemění.

export const SOUP_CATEGORY = "polevky";

export const SOUP_STORAGE = "Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.";

export const SOUP_SHELF_LIFE =
  "Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při skladování do 4 °C, nejpozději však do data ‚Spotřebujte do‘ uvedeného na obalu.";

/** Pokyn k ohřátí — samostatně (dřív jen v popisu „Stačí ohřát a servírovat“). */
export const SOUP_PREPARATION = "Stačí ohřát a servírovat.";

/** Řádek „Vrácení a reklamace“ — odkaz na obchodní podmínky je v RETURNS_LINK_TEXT. */
export const SOUP_RETURNS_BEFORE =
  "U tohoto výrobku nelze odstoupit od smlouvy bez udání důvodu, protože podléhá rychlé zkáze nebo má krátkou dobu spotřeby. Práva z vadného plnění tím nejsou dotčena. Podrobnosti najdete v čl. VII a VIII ";
export const SOUP_RETURNS_LINK_TEXT = "obchodních podmínek";
export const SOUP_RETURNS_AFTER = ".";
export const SOUP_RETURNS_TEXT = `${SOUP_RETURNS_BEFORE}${SOUP_RETURNS_LINK_TEXT}${SOUP_RETURNS_AFTER}`;
export const TERMS_PATH = "/obchodni-podminky";

// Texty části „Balení“ u produktů a stránka „O balení“ (zadání 9. 11. 2026).
// Označení velikosti je vždy jen objem: „3 l“, „650 ml“ (sirupy, od 11. 11.
// 2026; dříve „700 ml“), „500 ml“ (alkoholické nápoje). Rozlišuje se objem
// prodávaného obsahu a kapacita prázdného obalu — sirup se prodává jako
// 650 ml, i když má sáček kapacitu 750 ml. Hmotnosti pro dopravu (weight_g) se z objemu neodvozují.

export const PACKAGING_PAGE_PATH = "/o-baleni";
export const PACKAGING_MORE_LABEL = "Více o balení";

const THREE_L = "praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.";
const SYRUP_BOX = "Dodáváme v kartonové krabici.";
const SYRUP_SMALL = "lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.";
const ALCOHOL_500 = "lehké balení v průhledném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.";

export type PackagingCopy = { volume: string; text: string };

/**
 * Popis balení pro variantu („3 l – …“). null = pro tuto kombinaci kategorie
 * a velikosti text nemáme (taková varianta se v části Balení nezobrazí).
 */
export function packagingCopy(category: string, label: string | null): PackagingCopy | null {
  const volume = (label ?? "").trim();
  if (volume === "3 l") return { volume, text: category === "sirupy" ? `${THREE_L} ${SYRUP_BOX}` : THREE_L };
  // „700 ml“ jen do spuštění skriptu 93 (přechod na 650 ml).
  if ((volume === "650 ml" || volume === "700 ml") && category === "sirupy") return { volume, text: SYRUP_SMALL };
  if (volume === "500 ml" && category === "koktejly") return { volume, text: ALCOHOL_500 };
  return null;
}

/** Totéž jako jedna věta (uložené package_description v DB, exporty): „3 l – …“. */
export function packagingSentence(category: string, label: string | null): string | null {
  const copy = packagingCopy(category, label);
  return copy ? `${copy.volume} – ${copy.text}` : null;
}

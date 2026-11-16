// SLOVENSKÉ INFORMACE O POTRAVINÁCH (16. 11. 2026) — překlad složení do
// slovenštiny pro dodávky na Slovensko. Čísla (výživové údaje) ani alergeny
// se tu NEDRŽÍ — berou se živě z katalogu. U každého překladu je český
// text, ze kterého vznikl (sourceCz): když se složení v e-shopu změní,
// stránka překlad označí jako neaktuální a nevydává ho za platný.
export type SkFoodInfo = { nameSk: string; sourceCz: string; ingredientsSk: string; usageSk?: string };

// Ředění sirupů podle e-shopu (kategorie Bylinné sirupy: „Stačí zalít vodou
// v poměru přibližně 1 : 10 – studenou na limonádu, horkou na čaj.“).
export const SIRUP_USAGE_SK = "Rieďte vodou v pomere približne 1 : 10 – studenou na limonádu, horúcou na čaj. Balenie 3 l: až 150 nápojov.";

const sirup = (nameSk: string, percent: number, herbsCz: string, herbsSk: string, lemon: number): SkFoodInfo => ({
  nameSk,
  sourceCz: `třtinový cukr, bylinný výluh ${percent} % (čistá filtrovaná voda, ${herbsCz}), citronová šťáva ${lemon} %, antioxidant: kyselina askorbová (vitamin C)`,
  ingredientsSk: `trstinový cukor, bylinný výluh ${percent} % (čistá filtrovaná voda, ${herbsSk}), citrónová šťava ${lemon} %, antioxidant: kyselina askorbová (vitamín C)`,
  usageSk: SIRUP_USAGE_SK,
});

export const SK_FOOD_INFO: Record<string, SkFoodInfo> = {
  "zazvorovy-sirup": sirup("Zázvorový sirup", 39, "zázvor (Zingiber officinale)", "zázvor (Zingiber officinale)", 13),
  "lipovy-sirup": sirup("Lipový sirup", 39, "lipový květ (Tiliae flos)", "lipový kvet (Tiliae flos)", 11),
  "sipkovy-sirup": sirup("Šípkový sirup", 40, "šípek (Rosa canina)", "šípky (Rosa canina)", 9),
  "medunkovy-sirup-s-levanduli": sirup(
    "Medovkový sirup s levanduľou",
    39,
    "meduňka (Melissa officinalis), květ levandule (Lavandula angustifolia)",
    "medovka (Melissa officinalis), kvet levandule (Lavandula angustifolia)",
    13,
  ),
  "ibiskovy-sirup": sirup("Ibištekový sirup", 41, "květ ibišku (Hibiscus sabdariffa)", "kvet ibišteka (Hibiscus sabdariffa)", 8),
  "hermankovy-sirup": sirup("Harmančekový sirup", 40, "květ heřmánku (Matricaria chamomilla)", "kvet harmančeka (Matricaria chamomilla)", 10),
  "bylinny-sirup-saman": sirup(
    "Bylinný sirup Šaman",
    40,
    "šípek (Rosa canina), čaga (Inonotus obliquus), ženšen sibiřský (Eleutherococcus senticosus), zázvor (Zingiber officinale)",
    "šípky (Rosa canina), čaga (Inonotus obliquus), sibírsky ženšen – eleuterokok (Eleutherococcus senticosus), zázvor (Zingiber officinale)",
    10,
  ),
};

/** Společné věty (skladování, trvanlivost, upozornění): český text → slovenský. */
export const SK_PHRASES: Record<string, string> = {
  "Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.":
    "Pred otvorením skladujte v suchu a tme pri teplote do 20 °C. Po otvorení uchovávajte v chladničke pri teplote do 4 °C.",
  "Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.":
    "Neotvorené balenie spotrebujte do dátumu uvedeného na obale. Po otvorení spotrebujte do 3 mesiacov pri dodržaní podmienok skladovania, najneskôr však do dátumu uvedeného na obale.",
  "Není vhodné pro děti do 12 let, těhotné a kojící ženy.": "Nie je vhodné pre deti do 12 rokov, tehotné a dojčiace ženy.",
};

export type SkSheetSource = {
  slug: string;
  name: string;
  ingredients: string | null;
  /** null = alergeny v katalogu zatím nejsou vyplněné (neznámé), [] = bez alergenů */
  allergens: string[] | null;
  storage: string | null;
  shelfLife: string | null;
  warnings: string[];
};

export type SkSheet =
  | { status: "ok"; nameSk: string; ingredientsSk: string; usageSk: string | null; storageSk: string | null; shelfLifeSk: string | null; warningsSk: string[]; problems: string[] }
  | { status: "missing" }
  | { status: "stale" };

/**
 * Slovenský list jen když překlad odpovídá aktuálnímu českému složení.
 * Co přeložit nejde (neznámá věta, alergeny), se vypíše v problems —
 * nikdy se tiše nevynechá.
 */
export function buildSkSheet(product: SkSheetSource): SkSheet {
  const info = SK_FOOD_INFO[product.slug];
  if (!info) return { status: "missing" };
  if ((product.ingredients ?? "").trim() !== info.sourceCz) return { status: "stale" };
  const problems: string[] = [];
  const phrase = (cz: string | null, what: string): string | null => {
    if (!cz?.trim()) return null;
    const sk = SK_PHRASES[cz.trim()];
    if (!sk) problems.push(`${what}: chybí slovenský překlad věty „${cz.trim()}“.`);
    return sk ?? null;
  };
  if (product.allergens === null) problems.push("Alergeny nejsou v katalogu vyplněné — list nepoužívat.");
  else if (product.allergens.length > 0) problems.push(`Alergeny (${product.allergens.join(", ")}) nejsou přeložené — list nepoužívat.`);
  const warningsSk = product.warnings.map((warning) => phrase(warning, "Upozornění")).filter((value): value is string => value !== null);
  return {
    status: "ok",
    nameSk: info.nameSk,
    ingredientsSk: info.ingredientsSk,
    usageSk: info.usageSk ?? null,
    storageSk: phrase(product.storage, "Skladování"),
    shelfLifeSk: phrase(product.shelfLife, "Trvanlivost"),
    warningsSk,
    problems,
  };
}

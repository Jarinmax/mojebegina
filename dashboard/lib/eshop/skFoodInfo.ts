// SLOVENSKÉ INFORMACE O POTRAVINÁCH (16. 11. 2026) — překlad složení do
// slovenštiny pro dodávky na Slovensko. Čísla (výživové údaje) ani alergeny
// se tu NEDRŽÍ — berou se živě z katalogu. U každého překladu je český
// text, ze kterého vznikl (sourceCz): když se složení v e-shopu změní,
// stránka překlad označí jako neaktuální a nevydává ho za platný.
export type SkFoodInfo = { nameSk: string; sourceCz: string; ingredientsSk: string; usageSk?: string };

// Ředění sirupů podle e-shopu (kategorie Bylinkové sirupy: „Stačí zalít vodou
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
  // Polévky, ovocné nápoje a čaje (16. 11. 2026) — překlad složení z e-shopu.
  "dynova-polevka": {
    nameSk: "Tekvicová polievka",
    sourceCz: "dýně 41 %, čistá filtrovaná voda, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 10 %, cibule 5 %, kořen petržele, olivový olej, dýňový olej, mořská sůl, třtinový cukr, grapefruitová šťáva, lahůdkové droždí, sušený mletý zázvor, chilli, muškátový oříšek, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    ingredientsSk: "tekvica 41 %, čistá filtrovaná voda, kokosové mlieko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), zemiaky 10 %, cibuľa 5 %, koreň petržlenu, olivový olej, tekvicový olej, morská soľ, trstinový cukor, grapefruitová šťava, lahôdkové droždie, sušený mletý zázvor, čili, muškátový oriešok, klinčeky, antioxidant: kyselina askorbová (vitamín C), prírodná aróma",
  },
  "kulajda": {
    nameSk: "Kulajda",
    sourceCz: "čistá filtrovaná voda, brambory 22 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), žampiony 7 %, cibule 5 %, olivový olej, dýňový olej, mořská sůl, kopr, česnek, kmín, lahůdkové droždí, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "čistá filtrovaná voda, zemiaky 22 %, kokosové mlieko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), šampiňóny 7 %, cibuľa 5 %, olivový olej, tekvicový olej, morská soľ, kôpor, cesnak, rasca, lahôdkové droždie, antioxidant: kyselina askorbová (vitamín C)",
  },
  "rajcatova-polevka": {
    nameSk: "Paradajková polievka",
    sourceCz: "čistá filtrovaná voda, pasírovaná rajčata 27 % (rajčata 99,9 %, regulátor kyselosti: kyselina citronová), rajčatový protlak 7 % (rajčatový protlak, jedlá sůl 1 %), brambory 7 %, kokosové mléko 6 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), cibule 5 %, kořen petržele, olivový olej, třtinový cukr, mořská sůl, česnek, libeček, černý pepř, kardamom, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    ingredientsSk: "čistá filtrovaná voda, pasírované paradajky 27 % (paradajky 99,9 %, regulátor kyslosti: kyselina citrónová), paradajkový pretlak 7 % (paradajkový pretlak, jedlá soľ 1 %), zemiaky 7 %, kokosové mlieko 6 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), cibuľa 5 %, koreň petržlenu, olivový olej, trstinový cukor, morská soľ, cesnak, ligurček, čierne korenie, kardamóm, klinčeky, antioxidant: kyselina askorbová (vitamín C), prírodná aróma",
  },
  "rajcatova-polevka-s-cervenou-repou": {
    nameSk: "Paradajková polievka s červenou repou",
    sourceCz: "čistá filtrovaná voda, pasírovaná rajčata 17 % (rajčata 99,9 %, regulátor kyselosti: kyselina citronová), brambory 14 %, kokosové mléko 12 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), červená řepa 9 %, cibule 5 %, rajčatový protlak 3 % (rajčatový protlak, jedlá sůl 1 %), kořen petržele, olivový olej, mořská sůl, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    ingredientsSk: "čistá filtrovaná voda, pasírované paradajky 17 % (paradajky 99,9 %, regulátor kyslosti: kyselina citrónová), zemiaky 14 %, kokosové mlieko 12 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), červená repa 9 %, cibuľa 5 %, paradajkový pretlak 3 % (paradajkový pretlak, jedlá soľ 1 %), koreň petržlenu, olivový olej, morská soľ, trstinový cukor, antioxidant: kyselina askorbová (vitamín C), prírodná aróma",
  },
  "gulasova-polevka-z-hlivy-ustricne": {
    nameSk: "Gulášová polievka z hlivy ustricovej",
    sourceCz: "čistá filtrovaná voda, brambory 19 %, hlíva ústřičná (Pleurotus ostreatus) 7 %, cibule 4 %, rajčatový protlak 3 % (rajčatový protlak, jedlá sůl 1 %), mořská sůl, dýňový olej, česnek, olivový olej, majoránka, kmín, lahůdkové droždí, uzená paprika, sladká paprika, chilli, černý pepř, antioxidant: kyselina askorbová (vitamin C), skořice",
    ingredientsSk: "čistá filtrovaná voda, zemiaky 19 %, hliva ustricová (Pleurotus ostreatus) 7 %, cibuľa 4 %, paradajkový pretlak 3 % (paradajkový pretlak, jedlá soľ 1 %), morská soľ, tekvicový olej, cesnak, olivový olej, majorán, rasca, lahôdkové droždie, údená paprika, sladká paprika, čili, čierne korenie, antioxidant: kyselina askorbová (vitamín C), škorica",
  },
  "spenatova-polevka": {
    nameSk: "Špenátová polievka",
    sourceCz: "čistá filtrovaná voda, špenát 17 %, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 14 %, cibule 4 %, olivový olej, dýňový olej, mořská sůl, česnek, majoránka, kmín, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "čistá filtrovaná voda, špenát 17 %, kokosové mlieko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), zemiaky 14 %, cibuľa 4 %, olivový olej, tekvicový olej, morská soľ, cesnak, majorán, rasca, antioxidant: kyselina askorbová (vitamín C)",
  },
  "cervankove-nebe": {
    nameSk: "Červánkové nebe",
    sourceCz: "čistá filtrovaná voda, jablečno-malinová šťáva 34 % (jablečná šťáva 85 %, malinová šťáva 15 %), citronová šťáva 1 %, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    ingredientsSk: "čistá filtrovaná voda, jablkovo-malinová šťava 34 % (jablková šťava 85 %, malinová šťava 15 %), citrónová šťava 1 %, antioxidant: kyselina askorbová (vitamín C), prírodná aróma",
  },
  "dum-u-jezera": {
    nameSk: "Dům u jezera",
    sourceCz: "čistá filtrovaná voda, grepová šťáva 14 %, jablečná šťáva 14 %, citronová šťáva 4 %, antioxidant: kyselina askorbová (vitamin C), přírodní aroma",
    ingredientsSk: "čistá filtrovaná voda, grapefruitová šťava 14 %, jablková šťava 14 %, citrónová šťava 4 %, antioxidant: kyselina askorbová (vitamín C), prírodná aróma",
  },
  "malinovy-svarak-nealko": {
    nameSk: "Malinový svařák – nealko",
    sourceCz: "jablečno-malinová šťáva 51 % (jablečná šťáva 85 %, malinová šťáva 15 %), čistá filtrovaná voda, pomerančová šťáva 7 %, hřebíček, skořice, badyán, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "jablkovo-malinová šťava 51 % (jablková šťava 85 %, malinová šťava 15 %), čistá filtrovaná voda, pomarančová šťava 7 %, klinčeky, škorica, badián, antioxidant: kyselina askorbová (vitamín C)",
  },
  "bylinny-caj-saman": {
    nameSk: "Bylinný čaj Šaman",
    sourceCz: "bylinný výluh 93 % (čistá filtrovaná voda, šípek (Rosa canina), čaga (Inonotus obliquus), ženšen sibiřský (Eleutherococcus senticosus), zázvor (Zingiber officinale)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "bylinný výluh 93 % (čistá filtrovaná voda, šípky (Rosa canina), čaga (Inonotus obliquus), sibírsky ženšen – eleuterokok (Eleutherococcus senticosus), zázvor (Zingiber officinale)), trstinový cukor, citrónová šťava 2 %, antioxidant: kyselina askorbová (vitamín C)",
  },
  "zazvorovy-caj": {
    nameSk: "Zázvorový čaj",
    sourceCz: "bylinný výluh 93 % (čistá filtrovaná voda, zázvor (Zingiber officinale)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "bylinný výluh 93 % (čistá filtrovaná voda, zázvor (Zingiber officinale)), trstinový cukor, citrónová šťava 2 %, antioxidant: kyselina askorbová (vitamín C)",
  },
  "lipovy-caj": {
    nameSk: "Lipový čaj",
    sourceCz: "bylinný výluh 93 % (čistá filtrovaná voda, lipový květ (Tiliae flos)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "bylinný výluh 93 % (čistá filtrovaná voda, lipový kvet (Tiliae flos)), trstinový cukor, citrónová šťava 2 %, antioxidant: kyselina askorbová (vitamín C)",
  },
  "hermankovy-caj": {
    nameSk: "Harmančekový čaj",
    sourceCz: "bylinný výluh 92 % (čistá filtrovaná voda, květ heřmánku (Matricaria chamomilla)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "bylinný výluh 92 % (čistá filtrovaná voda, kvet harmančeka (Matricaria chamomilla)), trstinový cukor, citrónová šťava 2 %, antioxidant: kyselina askorbová (vitamín C)",
  },
  "cerny-caj-golden-nepal": {
    nameSk: "Čierny čaj Golden Nepal",
    sourceCz: "čajový výluh 93 % (čistá filtrovaná voda, černý čaj Golden Nepal (Camellia assamica)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "čajový výluh 93 % (čistá filtrovaná voda, čierny čaj Golden Nepal (Camellia assamica)), trstinový cukor, citrónová šťava 2 %, antioxidant: kyselina askorbová (vitamín C)",
  },
  "jasminovy-zeleny-caj": {
    nameSk: "Jazmínový zelený čaj",
    sourceCz: "čajový výluh 93 % (čistá filtrovaná voda, zelený čaj Sencha (Camellia sinensis), květ jasmínu (Jasminum officinale)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "čajový výluh 93 % (čistá filtrovaná voda, zelený čaj Sencha (Camellia sinensis), kvet jazmínu (Jasminum officinale)), trstinový cukor, citrónová šťava 2 %, antioxidant: kyselina askorbová (vitamín C)",
  },
  "ibiskovy-caj": {
    nameSk: "Ibištekový čaj",
    sourceCz: "bylinný výluh 92 % (čistá filtrovaná voda, květ ibišku (Hibiscus sabdariffa)), třtinový cukr, citronová šťáva 3 %, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "bylinný výluh 92 % (čistá filtrovaná voda, kvet ibišteka (Hibiscus sabdariffa)), trstinový cukor, citrónová šťava 3 %, antioxidant: kyselina askorbová (vitamín C)",
  },
  "medunkovy-caj-s-levanduli": {
    nameSk: "Medovkový čaj s levanduľou",
    sourceCz: "bylinný výluh 92 % (čistá filtrovaná voda, meduňka (Melissa officinalis), květ levandule (Lavandula angustifolia)), třtinový cukr, citronová šťáva 2 %, antioxidant: kyselina askorbová (vitamin C)",
    ingredientsSk: "bylinný výluh 92 % (čistá filtrovaná voda, medovka (Melissa officinalis), kvet levandule (Lavandula angustifolia)), trstinový cukor, citrónová šťava 2 %, antioxidant: kyselina askorbová (vitamín C)",
  },

};

/** Společné věty (skladování, trvanlivost, upozornění): český text → slovenský. */
export const SK_PHRASES: Record<string, string> = {
  "Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.":
    "Pred otvorením skladujte v suchu a tme pri teplote do 20 °C. Po otvorení uchovávajte v chladničke pri teplote do 4 °C.",
  "Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.":
    "Neotvorené balenie spotrebujte do dátumu uvedeného na obale. Po otvorení spotrebujte do 3 mesiacov pri dodržaní podmienok skladovania, najneskôr však do dátumu uvedeného na obale.",
  "Není vhodné pro děti do 12 let, těhotné a kojící ženy.": "Nie je vhodné pre deti do 12 rokov, tehotné a dojčiace ženy.",
  "Obsahuje kofein – není vhodné pro děti, těhotné a kojící ženy.": "Obsahuje kofeín – nie je vhodné pre deti, tehotné a dojčiace ženy.",
  "Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.": "Skladujte v chladničke pri teplote do 4 °C, a to pred otvorením aj po otvorení.",
  "Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.":
    "Neotvorené balenie spotrebujte do dátumu uvedeného na obale. Po otvorení spotrebujte do 14 dní pri dodržaní podmienok skladovania, najneskôr však do dátumu uvedeného na obale.",
  "Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 5 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.":
    "Neotvorené balenie spotrebujte do dátumu uvedeného na obale. Po otvorení spotrebujte do 5 dní pri dodržaní podmienok skladovania, najneskôr však do dátumu uvedeného na obale.",
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

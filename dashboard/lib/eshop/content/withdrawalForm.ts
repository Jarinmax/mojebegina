// Vzorový formulář pro odstoupení od smlouvy — příloha obchodních podmínek.
//
// Znění podle přílohy nařízení vlády č. 29/2023 Sb., o vzorovém poučení
// o právu na odstoupení od smluv uzavřených distančním způsobem nebo mimo
// obchodní prostory a vzorovém formuláři pro odstoupení od těchto smluv,
// ve znění nařízení vlády č. 66/2026 Sb. (účinné od 19. 6. 2026; nahradilo
// zrušené nařízení č. 363/2013 Sb.). Formulář vyplňuje spotřebitel; adresáta
// doplňuje obchodník. Jediný doplněk proti vzoru: nepovinné číslo objednávky
// (schváleno vedením 26. 10. 2026) — usnadní dohledání, spotřebitel ho
// uvádět nemusí.
//
// Formulář je součástí znění obchodních podmínek (termsVersions.ts) — jeho
// text je chráněný stejným otiskem jako zbytek znění.
import type { InfoBlock } from "../infoPages";
import { DELIVERY_ADDRESS, OPERATOR } from "../operator";

export const WITHDRAWAL_FORM_TITLE = "Vzorový formulář pro odstoupení od smlouvy";

export function withdrawalFormBlock(): InfoBlock {
  return {
    heading: `Příloha: ${WITHDRAWAL_FORM_TITLE}`,
    paragraphs: [
      "(vyplňte tento formulář a pošlete jej zpět pouze v případě, že chcete odstoupit od smlouvy)",
      "Oznámení o odstoupení od smlouvy",
    ],
    items: [
      `Adresát: ${OPERATOR.name}, ${OPERATOR.address}, IČO: ${OPERATOR.ico}, e-mail: ${OPERATOR.email}`,
      "Oznamuji/oznamujeme (*), že tímto odstupuji/odstupujeme (*) od smlouvy o nákupu tohoto zboží (*)/o poskytnutí těchto služeb (*):",
      "Číslo objednávky (nepovinné):",
      "Datum objednání (*)/datum obdržení (*):",
      "Jméno a příjmení spotřebitele/spotřebitelů:",
      "Adresa spotřebitele/spotřebitelů:",
      "Podpis spotřebitele/spotřebitelů (pouze pokud je tento formulář zasílán na listině):",
      "Datum:",
    ],
    afterParagraphs: ["(*) Nehodící se škrtněte nebo údaje doplňte."],
  };
}

// ---------------------------------------------------------------------------
// 3. vydání (zadání Lucie, 6. 11. 2026): adresát s doručovací adresou ve
// Viticích. Vzor (NV 29/2023 Sb.) žádá u adresáta jméno, adresu sídla
// a e-mail — sídlo proto zůstává uvedené také, doručovací adresa je první.
// Datum objednání a datum obdržení jsou dva samostatné řádky; formulář je
// jen pro zboží (Begina služby ani digitální obsah neprodává).
// ---------------------------------------------------------------------------

/** Stránka s formulářem k tisku a odkazem na PDF (cesta e-shopu bez /eshop). */
export const WITHDRAWAL_PAGE_PATH = "/odstoupeni-od-smlouvy";
/** Adresa stránky v textu podmínek (InfoPageView ji zobrazí jako odkaz). */
export const WITHDRAWAL_PAGE_URL_TEXT = `www.begina.cz${WITHDRAWAL_PAGE_PATH}`;
/** PDF formuláře (cesta e-shopu bez /eshop). */
export const WITHDRAWAL_FORM_PDF_PATH = "/obchodni-podminky/formular-pro-odstoupeni-od-smlouvy.pdf";
export const WITHDRAWAL_FORM_PDF_FILENAME = "formular-pro-odstoupeni-od-smlouvy-begina.pdf";
export const WITHDRAWAL_FORM_DOWNLOAD_LABEL = "Stáhnout formulář pro odstoupení od smlouvy (PDF)";

export const WITHDRAWAL_ADDRESSEE = `Adresát: ${DELIVERY_ADDRESS.oneLine}, e-mail: ${DELIVERY_ADDRESS.email}; sídlo: ${OPERATOR.address}, IČO: ${OPERATOR.ico}`;

/** Pole formuláře, která vyplňuje spotřebitel (končí dvojtečkou → linky v PDF). */
export const WITHDRAWAL_FIELDS = [
  "Oznamuji/oznamujeme (*), že tímto odstupuji/odstupujeme (*) od smlouvy o nákupu tohoto zboží (název výrobku, balení, počet kusů):",
  "Číslo objednávky (nepovinné):",
  "Datum objednání:",
  "Datum obdržení (převzetí) zboží:",
  "Jméno a příjmení spotřebitele/spotřebitelů:",
  "Adresa spotřebitele/spotřebitelů:",
  "Podpis spotřebitele/spotřebitelů (pouze pokud je tento formulář zasílán na listině):",
  "Datum:",
] as const;

export const WITHDRAWAL_FORM_NOTES = [
  "(*) Nehodící se škrtněte nebo údaje doplňte.",
  "Použití tohoto formuláře není podmínkou odstoupení od smlouvy — odstoupení lze oznámit i jiným jednoznačným prohlášením, například e-mailem na info@begina.cz.",
  "Vyplněný formulář můžete poslat e-mailem na info@begina.cz (stačí sken nebo fotografie, podpis není potřeba), dopisem na doručovací adresu ve Viticích, nebo jej předat osobně v provozovně.",
];

export function withdrawalFormBlockV3(): InfoBlock {
  return {
    heading: `Příloha: ${WITHDRAWAL_FORM_TITLE}`,
    paragraphs: [
      "(vyplňte tento formulář a pošlete jej zpět pouze v případě, že chcete odstoupit od smlouvy)",
      "Oznámení o odstoupení od smlouvy",
    ],
    items: [WITHDRAWAL_ADDRESSEE, ...WITHDRAWAL_FIELDS],
    afterParagraphs: WITHDRAWAL_FORM_NOTES,
  };
}

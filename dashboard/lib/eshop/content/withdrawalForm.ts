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
import { OPERATOR } from "../operator";

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

// Poučení o odstoupení od smlouvy a vzorový formulář — obsah stránky
// /odstoupeni-od-smlouvy i PDF pro zákazníka.
//
// NÁVRH K ODBORNÉMU SCHVÁLENÍ. Poučení = doslova čl. VII obchodních
// podmínek (text vedení, nic se nepřidává ani neubírá — výjimky podle
// kategorií výrobků zatím rozhodnuty nejsou). Formulář = vzor z přílohy
// nařízení vlády č. 363/2013 Sb.; adresát doplněný z lib/eshop/seller.ts.
import type { InfoBlock } from "../infoPages";
import { TERMS_BLOCKS, TERMS_EFFECTIVE } from "../content/obchodniPodminky";
import { SELLER } from "../seller";

/** Článek VII obchodních podmínek (odstoupení) — beze změny textu. */
export const WITHDRAWAL_TERMS_ARTICLE: InfoBlock = (() => {
  const article = TERMS_BLOCKS.find((block) => block.heading?.startsWith("VII."));
  if (!article) throw new Error("Obchodní podmínky: chybí čl. VII (odstoupení)");
  return article;
})();

/** Komu odstoupení poslat (z čl. VII: e-mail nebo písemně na adresu prodávajícího). */
export const WITHDRAWAL_ADDRESSEE_LINES = [
  SELLER.name,
  SELLER.address,
  `e-mail: ${SELLER.email}`,
  `telefon: ${SELLER.phone}`,
] as const;

export const WITHDRAWAL_FORM_TITLE = "Vzorový formulář pro odstoupení od smlouvy";

/** Pole formuláře (příloha nařízení vlády č. 363/2013 Sb.) — za každým je místo na vyplnění. */
export const WITHDRAWAL_FORM_FIELDS = [
  "Oznamuji/oznamujeme (*), že tímto odstupuji/odstupujeme (*) od smlouvy o nákupu tohoto zboží:",
  "Datum objednání (*)/datum obdržení (*):",
  "Jméno a příjmení spotřebitele/spotřebitelů:",
  "Adresa spotřebitele/spotřebitelů:",
  "Podpis spotřebitele/spotřebitelů (pouze pokud je tento formulář zasílán v listinné podobě):",
  "Datum:",
] as const;

export const WITHDRAWAL_FORM_INTRO =
  "(vyplňte tento formulář a pošlete jej zpět pouze v případě, že chcete odstoupit od smlouvy)";
export const WITHDRAWAL_FORM_FOOTNOTE = "(*) Nehodící se škrtněte nebo údaje doplňte.";

/** Formulář jako blok stránky / PDF. */
export const WITHDRAWAL_FORM_BLOCK: InfoBlock = {
  heading: WITHDRAWAL_FORM_TITLE,
  paragraphs: [WITHDRAWAL_FORM_INTRO, "Oznámení o odstoupení od smlouvy", "Adresát:"],
  lines: [...WITHDRAWAL_ADDRESSEE_LINES],
  items: [...WITHDRAWAL_FORM_FIELDS],
  afterParagraphs: [WITHDRAWAL_FORM_FOOTNOTE],
};

/** Stránka /odstoupeni-od-smlouvy: poučení (čl. VII VOP) + kam poslat + formulář. */
export const WITHDRAWAL_PAGE_BLOCKS: InfoBlock[] = [
  {
    ...WITHDRAWAL_TERMS_ARTICLE,
    heading: `Poučení — znění čl. VII obchodních podmínek platných a účinných od ${TERMS_EFFECTIVE}`,
  },
  {
    heading: "Kam odstoupení poslat",
    lines: [...WITHDRAWAL_ADDRESSEE_LINES],
  },
  WITHDRAWAL_FORM_BLOCK,
];

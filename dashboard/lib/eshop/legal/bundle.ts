// Balíček dokumentů pro zákazníka (trvalý nosič, § 1824 OZ): obchodní
// podmínky + poučení o odstoupení + vzorový formulář — v JEDNOM PDF.
// Obsah se skládá jen z existujících textů (obchodní podmínky, čl. VII,
// vzor podle nařízení vlády) a údajů prodávajícího (seller.ts).
import type { InfoBlock } from "../infoPages";
import { TERMS_BLOCKS, TERMS_EFFECTIVE } from "../content/obchodniPodminky";
import { SELLER } from "../seller";
import { WITHDRAWAL_ADDRESSEE_LINES, WITHDRAWAL_FORM_BLOCK, WITHDRAWAL_TERMS_ARTICLE } from "./withdrawal";

export type LegalSection = { title: string; subtitle?: string; blocks: InfoBlock[] };
export type LegalBundle = { title: string; sections: LegalSection[]; footer: string };

export const LEGAL_BUNDLE_TITLE = "Obchodní podmínky e-shopu Begina.cz";

export function legalBundleContent(versionId: string): LegalBundle {
  return {
    title: LEGAL_BUNDLE_TITLE,
    footer: `${SELLER.name}, IČO ${SELLER.ico} · ${LEGAL_BUNDLE_TITLE}, verze ${versionId}`,
    sections: [
      {
        title: LEGAL_BUNDLE_TITLE,
        subtitle: `Platné a účinné od ${TERMS_EFFECTIVE}`,
        blocks: TERMS_BLOCKS,
      },
      {
        title: "Poučení o odstoupení od smlouvy",
        subtitle: `Znění čl. VII obchodních podmínek platných a účinných od ${TERMS_EFFECTIVE}`,
        blocks: [
          { ...WITHDRAWAL_TERMS_ARTICLE, heading: undefined },
          { heading: "Kam odstoupení poslat", lines: [...WITHDRAWAL_ADDRESSEE_LINES] },
        ],
      },
      { title: WITHDRAWAL_FORM_BLOCK.heading!, blocks: [{ ...WITHDRAWAL_FORM_BLOCK, heading: undefined }] },
    ],
  };
}

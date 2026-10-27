// Znění obchodních podmínek (verze). Uchování znění platného při objednávce:
//
//   - každé znění má id (= datum účinnosti RRRR-MM-DD) a je NEMĚNNÉ: test
//     (termsVersions.test.ts) hlídá otisk SHA-256 textu i PDF každého znění,
//     takže úprava už platného textu neprojde — nový text = nové znění,
//   - platné je vždy POSLEDNÍ znění v seznamu (CURRENT_TERMS) — nasazením
//     nového znění začne platit pro nové objednávky,
//   - objednávka si při vzniku zapíše id znění, se kterým zákazník souhlasil
//     (order_activity „created“, metadata.termsVersion — orderWrite.ts);
//     objednávky z doby před verzováním mají 1. znění (jiné neexistovalo),
//   - potvrzovací e-mail nese PDF právě toho znění (lib/eshop/legal/termsPdf.ts)
//     a do historie objednávky se zapíše jeho otisk; každé znění je navíc
//     trvale ke stažení na /obchodni-podminky/<id>.pdf.
//
// Bez node:crypto — soubor používají i klientské komponenty (pokladna).
import type { InfoBlock } from "../infoPages";
import { termsBlocks } from "./obchodniPodminky";

export type TermsVersion = {
  /** = datum účinnosti RRRR-MM-DD; zapisuje se k objednávce */
  id: string;
  /** datum účinnosti slovy (čl. XIII, podtitulek stránky, PDF) */
  effectiveLabel: string;
  withWithdrawalForm: boolean;
  blocks: InfoBlock[];
};

function version(id: string, effectiveLabel: string, withWithdrawalForm: boolean): TermsVersion {
  return { id, effectiveLabel, withWithdrawalForm, blocks: termsBlocks(effectiveLabel, withWithdrawalForm) };
}

export const TERMS_VERSIONS: readonly TermsVersion[] = [
  // 1. znění — dodané vedením 3. 10. 2026, na webu od spuštění pokladny
  version("2026-09-22", "22. září 2026", false),
  // 2. znění — věta o vzorovém formuláři v čl. VII + formulář v příloze
  // (schváleno 26. 10. 2026); datum účinnosti = den nasazení
  version("2026-10-27", "27. října 2026", true),
];

/** Znění platné pro nové objednávky. */
export const CURRENT_TERMS: TermsVersion = TERMS_VERSIONS[TERMS_VERSIONS.length - 1];

/** Znění pro objednávky z doby před verzováním (jiné tehdy neexistovalo). */
export const LEGACY_TERMS: TermsVersion = TERMS_VERSIONS[0];

const VERSION_ID = /^\d{4}-\d{2}-\d{2}$/;

export function findTermsVersion(id: string | null | undefined): TermsVersion | null {
  if (!id || !VERSION_ID.test(id)) return null;
  return TERMS_VERSIONS.find((v) => v.id === id) ?? null;
}

/** Znění, se kterým souhlasil zákazník objednávky (zapsané id; bez záznamu 1. znění). */
export function termsVersionForOrder(recordedId: string | null | undefined): TermsVersion {
  return findTermsVersion(recordedId) ?? LEGACY_TERMS;
}

export const termsPdfFilename = (v: Pick<TermsVersion, "id">) => `obchodni-podminky-begina-${v.id}.pdf`;

/** Cesta e-shopu (bez /eshop) k PDF daného znění — trvalá adresa. */
export const termsPdfPath = (v: Pick<TermsVersion, "id">) => `/obchodni-podminky/${v.id}.pdf`;

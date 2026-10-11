// Verze dokumentů pro zákazníka (obchodní podmínky + poučení o odstoupení
// + vzorový formulář) a jejich NEMĚNNÁ PDF. K objednávce se ukládá verze
// platná v okamžiku odeslání (legalAcceptance) a zákazník dostane přesně
// to PDF (legalPdf). Starší verze zůstávají navždy — patří k objednávkám,
// které je přijaly.
//
// Změna textů = nová verze: nové ID (datum účinnosti, případně „-2“),
// `npx tsx scripts/eshop-legal/build-pdf.mts`, sha256 do záznamu níže.
// Test (lib/eshop/__tests__/legalDocuments.test.ts) hlídá, že aktuální
// PDF odpovídá textům a žádné uložené PDF se nezměnilo.
import { createHash } from "node:crypto";

export type LegalVersion = {
  id: string;
  /** datum účinnosti obchodních podmínek (jak je v textu) */
  termsEffective: string;
  sha256: string;
  load: () => Promise<string>;
};

export const LEGAL_VERSIONS: Readonly<Record<string, LegalVersion>> = {
  "2026-09-22": {
    id: "2026-09-22",
    termsEffective: "22. září 2026",
    sha256: "a224d778b5debd9e98eceff2153574780f73a34a7b600e434919af94fe22949f",
    load: () => import("./pdf/2026-09-22").then((m) => m.PDF_BASE64),
  },
};

export const CURRENT_LEGAL_VERSION = "2026-09-22";

/** Co se uloží k objednávce v okamžiku odeslání (historie objednávky). */
export type LegalAcceptance = { version: string; sha256: string };

export function legalAcceptance(): LegalAcceptance {
  const current = LEGAL_VERSIONS[CURRENT_LEGAL_VERSION];
  return { version: current.id, sha256: current.sha256 };
}

export function legalPdfFilename(versionId: string): string {
  return `obchodni-podminky-begina-${versionId}.pdf`;
}

export type LegalPdf = { versionId: string; filename: string; contentBase64: string; sha256: string };

/**
 * PDF dané verze (null = objednávka z doby před evidencí verzí → aktuální
 * verze). Neznámá verze nebo nesouhlasný otisk = chyba — raději nic než
 * jiné podmínky, než jaké zákazník přijal.
 */
export async function legalPdf(versionId: string | null | undefined): Promise<LegalPdf> {
  const version = LEGAL_VERSIONS[versionId ?? CURRENT_LEGAL_VERSION];
  if (!version) throw new Error(`Neznámá verze obchodních podmínek: ${versionId}`);
  const contentBase64 = await version.load();
  const sha256 = createHash("sha256").update(Buffer.from(contentBase64, "base64")).digest("hex");
  if (sha256 !== version.sha256) throw new Error(`PDF obchodních podmínek ${version.id} neodpovídá otisku`);
  return { versionId: version.id, filename: legalPdfFilename(version.id), contentBase64, sha256 };
}

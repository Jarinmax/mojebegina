// Uloží PDF balíček (obchodní podmínky + poučení + formulář) pro AKTUÁLNÍ
// verzi do lib/eshop/legal/pdf/<verze>.ts (base64 — součást serverového
// kódu, neměnný). Spuštění: npx tsx scripts/eshop-legal/build-pdf.mts
//
// Nová verze textů = nové ID v lib/eshop/legal/versions.ts (CURRENT_LEGAL_VERSION
// + záznam s sha256). Starý soubor se NIKDY nepřepisuje ani nemaže — patří
// k objednávkám, které ho přijaly. Skript odmítne přepsat existující verzi
// jiným obsahem.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildLegalPdf } from "../../lib/eshop/legal/pdfBuilder";
import { CURRENT_LEGAL_VERSION } from "../../lib/eshop/legal/versions";

export function pdfModuleSource(base64: string, sha256: string): string {
  return (
    "// VYGENEROVÁNO scripts/eshop-legal/build-pdf.mts — NEMĚNIT RUČNĚ.\n" +
    `// sha256 ${sha256}\n` +
    `export const PDF_BASE64 =\n  "${base64}";\n`
  );
}

const pdf = await buildLegalPdf(CURRENT_LEGAL_VERSION);
const sha256 = createHash("sha256").update(pdf).digest("hex");
const file = path.join(process.cwd(), "lib/eshop/legal/pdf", `${CURRENT_LEGAL_VERSION}.ts`);
const source = pdfModuleSource(Buffer.from(pdf).toString("base64"), sha256);
if (existsSync(file) && readFileSync(file, "utf8") !== source) {
  console.error(`STOP: verze ${CURRENT_LEGAL_VERSION} už existuje s jiným obsahem. Změněné texty = nová verze.`);
  process.exit(1);
}
writeFileSync(file, source);
console.log(`${file}\nsha256 ${sha256}\n${pdf.length} B`);

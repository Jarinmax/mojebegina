// Doklad z e-mailu bez PDF přílohy (např. faktury Apple jsou jen text
// v e-mailu) → jednoduché PDF, které se připojí k nákladu v Dokladech.
// Zadání Lucie 20. 11. 2026: „nesmíme být závislí jenom na formátu faktury“.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { BEGINA_PDF_SANS_BOLD, BEGINA_PDF_SANS_REGULAR } from "@/lib/eshop/legal/fonts/beginaPdfSans";
import { wrapText } from "@/lib/eshop/legal/termsPdf";

export type EmailDocumentInput = {
  sender: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
};

/** Odkazy z Markdownu na text, tabulkové svislice pryč, prázdné řádky sloučit. */
export function cleanEmailText(text: string): string[] {
  const noLinks = text.replace(/\[([^\]]*)\]\((?:[^)(]|\([^)]*\))*\)/g, "$1").replace(/[|#*]+/g, " ");
  const out: string[] = [];
  for (const raw of noLinks.split(/\r?\n/)) {
    const line = raw.replace(/[\t ]+/g, " ").trim();
    if (!line && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

export async function emailDocumentPdf(input: EmailDocumentInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(Buffer.from(BEGINA_PDF_SANS_REGULAR, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(BEGINA_PDF_SANS_BOLD, "base64"), { subset: true });
  const have = new Set(regular.getCharacterSet());
  // znaky, které font nemá (emoji, „•“ apod.), nahradit, ať se nevykreslí čtverec
  const safe = (s: string) => [...s].map((ch) => (/\s/.test(ch) || have.has(ch.codePointAt(0)!) ? ch : ch === "•" ? "*" : "?")).join("");

  doc.setTitle(safe(`Doklad z e-mailu: ${input.subject}`).slice(0, 200));
  doc.setProducer("MojeBegina");
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));

  const W = 595.28, H = 841.89, M = 48, TW = W - 2 * M;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const write = (text: string, size: number, isBold = false, gray = false) => {
    const font = isBold ? bold : regular;
    for (const part of wrapText(safe(text), font, size, TW)) {
      if (y < M + size) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
      page.drawText(part, { x: M, y: y - size, size, font, color: gray ? rgb(0.4, 0.4, 0.4) : rgb(0, 0, 0) });
      y -= size * 1.4;
    }
  };

  write("Doklad převedený z e-mailu", 14, true);
  write("Originál přišel jen jako text e-mailu (bez PDF přílohy); níže je jeho úplný obsah.", 8.5, false, true);
  y -= 6;
  write(`Od: ${input.sender}`, 9.5);
  write(`Doručeno: ${input.receivedAt}`, 9.5);
  write(`Předmět: ${input.subject}`, 9.5, true);
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  y -= 12;
  for (const line of cleanEmailText(input.bodyText)) {
    if (!line) {
      y -= 5;
      continue;
    }
    write(line, 9.5);
  }
  return doc.save({ useObjectStreams: true });
}

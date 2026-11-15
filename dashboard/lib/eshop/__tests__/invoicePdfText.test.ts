// Čtení textu z PDF faktury (pdfText.ts) — PDF vyrobené pdf-lib: standardní
// písmo (WinAnsi, bez ToUnicode) i vložené písmo Type0/Identity-H s ToUnicode
// jako v PDF z iDokladu; čeština s diakritikou.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { checkInvoicePdfText, extractPdfText } from "../invoicing/pdfText";

const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

async function pdfWith(lines: string[], embedded: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = embedded ? await doc.embedFont(readFileSync(FONT), { subset: true }) : await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  lines.forEach((text, i) => page.drawText(text, { x: 40, y: 800 - i * 20, size: 11, font }));
  return doc.save();
}

describe("text z PDF faktury", () => {
  it("standardní písmo: řádky a kontrola výzvy k úhradě", async () => {
    const text = await extractPdfText(await pdfWith(["Faktura 20260212", "Zpusob uhrady: Prevodem", "Celkem k uhrade 2 156,00 Kc"], false));
    expect(text.split("\n")).toEqual(["Faktura 20260212", "Zpusob uhrady: Prevodem", "Celkem k uhrade 2 156,00 Kc"]);
    expect(checkInvoicePdfText(text)).toMatchObject({ ok: false, paymentRequest: ["Celkem k uhrade 2 156,00 Kc"] });
  });

  it.skipIf(!existsSync(FONT))("vložené písmo s ToUnicode (jako iDoklad): čeština, uhrazená faktura projde", async () => {
    const paid = await extractPdfText(await pdfWith(["Faktura č. 20260212", "Způsob úhrady: Hotově", "Celkem k úhradě", "0,00 Kč", "Datum splatnosti: 17. 11. 2026", "Uhrazeno 2 156,00 Kč"], true));
    expect(paid).toContain("Způsob úhrady: Hotově");
    expect(checkInvoicePdfText(paid)).toEqual({ ok: true, paymentRequest: [], overdueNotice: [], amountLines: ["Celkem k úhradě 0,00 Kč"] });

    const unpaid = await extractPdfText(await pdfWith(["QR Platba", "Celkem k úhradě 2 156,00 Kč", "Faktura je po splatnosti, uhraďte ji prosím."], true));
    const check = checkInvoicePdfText(unpaid);
    expect(check.ok).toBe(false);
    expect(check.paymentRequest).toEqual(expect.arrayContaining(["QR Platba", "Faktura je po splatnosti, uhraďte ji prosím."]));
    expect(check.overdueNotice).toEqual(["Faktura je po splatnosti, uhraďte ji prosím."]);
  });

  it("čísla bez měny (data, čísla dokladů) na řádku k úhradě nejsou částka", () => {
    expect(checkInvoicePdfText("Zbývá uhradit\n0 Kč\nDatum 17.11.2026 č. 20260212").ok).toBe(true);
  });
});

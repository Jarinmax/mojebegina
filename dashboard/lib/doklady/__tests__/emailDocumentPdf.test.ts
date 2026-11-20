import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { cleanEmailText, emailDocumentPdf } from "../emailDocumentPdf";

const APPLE = "# Faktura\n\n20. listopadu 2026\n\nID objednávky:\n\nMKBB5NJJKQ\n\n| | Claude Ultra - Monthly (Měsíční) | 6 990,00 Kč |\n\nVisa •••• 0536\n\n[Historie nákupů ›](https://apps.apple.com/account/purchases)";

describe("doklad z textu e-mailu", () => {
  it("vyčistí odkazy, svislice a prázdné řádky", () => {
    const lines = cleanEmailText(APPLE);
    expect(lines).toContain("Faktura");
    expect(lines).toContain("Claude Ultra - Monthly (Měsíční) 6 990,00 Kč");
    expect(lines).toContain("Historie nákupů ›");
    expect(lines.join("\n")).not.toMatch(/https?:|\|/);
    expect(lines.join("\n")).not.toMatch(/\n\n\n/);
  });

  it("vytvoří platné PDF i s českými znaky a symboly, které font nemá", async () => {
    const bytes = await emailDocumentPdf({ sender: "Apple <no_reply@email.apple.com>", subject: "Vaše faktura od společnosti Apple", receivedAt: "20. 11. 2026 18:50", bodyText: APPLE + "\n😀" });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toContain("Vaše faktura od společnosti Apple");
  });

  it("dlouhý text pokračuje na další stránce", async () => {
    const body = Array.from({ length: 200 }, (_, i) => `Řádek ${i + 1} položky dokladu`).join("\n");
    const pdf = await PDFDocument.load(await emailDocumentPdf({ sender: "x", subject: "y", receivedAt: "z", bodyText: body }));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});

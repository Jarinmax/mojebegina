import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { salesManualDocument, salesManualPdf } from "../salesManualPdfLive";

describe("PDF manuálu generované při stažení", () => {
  it("obsahuje ceny s dopravou a adresu bistra", async () => {
    const text = salesManualDocument("24. 11. 2026").map((l) => (l.kind === "text" ? l.text : "")).join("\n");
    expect(text).toContain("včetně chlazené dopravy");
    expect(text).toContain("Vitice 119, 281 06 Vitice");
    const bytes = await salesManualPdf(new Date("2026-11-24T12:00:00Z"));
    expect(bytes.length).toBeGreaterThan(5000);
    if (process.env.MANUAL_PDF_OUT) writeFileSync(process.env.MANUAL_PDF_OUT, bytes);
  });
});

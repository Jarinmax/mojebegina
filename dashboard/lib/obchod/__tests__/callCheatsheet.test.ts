import { describe, expect, it } from "vitest";
import { callCheatsheetDocument, callCheatsheetPdf, callCheatsheetSections } from "../callCheatsheet";

describe("taháček k hovoru", () => {
  it("má všech 8 částí a porci polévky s dopravou", () => {
    const sections = callCheatsheetSections();
    expect(sections.map((s) => s.title)[0]).toBe("Cíl hovoru");
    expect(sections).toHaveLength(8);
    expect(sections[3].items?.[2]).toMatch(/^Porce polévky 250 ml od \d+(,\d+)? Kč včetně chlazené dopravy/);
  });
  it("vytvoří PDF bez šipek", async () => {
    expect(callCheatsheetDocument().some((l) => l.kind === "text" && l.text.includes("→"))).toBe(false);
    const bytes = await callCheatsheetPdf(new Date("2026-11-27T12:00:00Z"));
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
  });
});

// Řízení firmy — Rozdělení odpovědností: oba majitelé a výkonný ředitel.
import { describe, expect, it } from "vitest";
import { companyOverview } from "../companyOverview";

describe("Rozdělení odpovědností", () => {
  it("majitelé Jaroslav Viner a Lucie Königsbergová, pak výkonný ředitel (8. 10. 2026)", () => {
    expect(companyOverview.responsibilities.map((o) => [o.name, o.role])).toEqual([
      ["Jaroslav Viner", "Majitel"],
      ["Lucie Königsbergová", "Majitelka · finanční ředitelka"],
      ["Jiří Střelec", "Výkonný ředitel"],
    ]);
    expect(companyOverview.responsibilities.every((o) => o.areas.length > 0)).toBe(true);
  });
});

// Řízení firmy — Rozdělení odpovědností: oba majitelé na stejné úrovni, pak výkonný ředitel.
import { describe, expect, it } from "vitest";
import { companyOverview } from "../companyOverview";

describe("Rozdělení odpovědností", () => {
  it("pořadí a role podle zadání majitele (8. 10. 2026): CEO, CFO, COO", () => {
    expect(companyOverview.responsibilities.map((o) => [o.name, o.role])).toEqual([
      ["Jaroslav Viner", "Majitel, zakladatel, CEO"],
      ["Lucie Königsbergová", "Spolumajitelka, investorka, finanční ředitelka (CFO)"],
      ["Jiří Střelec", "Výkonný ředitel (COO)"],
    ]);
    expect(companyOverview.responsibilities.every((o) => o.areas.length > 0)).toBe(true);
  });
});

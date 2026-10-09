// Řízení firmy — Rozdělení odpovědností: vedení (CEO, CFO, COO) beze změny,
// pod ním druhá řada týmu (jen zobrazení, žádná oprávnění).
import { describe, expect, it } from "vitest";
import { companyOverview } from "../companyOverview";

describe("Rozdělení odpovědností", () => {
  it("první řada — vedení: pořadí a role podle zadání majitele (8. 10. 2026)", () => {
    expect(companyOverview.responsibilities.map((o) => [o.name, o.role])).toEqual([
      ["Jaroslav Viner", "Majitel, zakladatel, CEO"],
      ["Lucie Königsbergová", "Spolumajitelka, investorka, finanční ředitelka (CFO)"],
      ["Jiří Střelec", "Výkonný ředitel (COO)"],
    ]);
    expect(companyOverview.responsibilities.every((o) => o.areas.length > 0)).toBe(true);
  });

  it("druhá řada — tým: pořadí a odpovědnosti podle zadání majitele (9. 10. 2026)", () => {
    expect(companyOverview.teamResponsibilities.map((o) => [o.name, o.role])).toEqual([
      ["Jaroslav Blahout", "Obchod, bistro, programování, vývoj"],
      ["Josef Göndör", "Marketing, strategie"],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { formatNutrition, nutritionTable } from "../nutrition";

// Tabulka nesmí měnit čísla oproti dosavadnímu textu (10. 11. 2026).
const numbers = (s: string) => (s.match(/\d+(?:,\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

describe("nutritionTable", () => {
  const cases: Record<string, unknown>[] = [
    { energy_kj: 210, energy_kcal: 50, fat: 3.2, saturates: 1.7, carbohydrate: 4.1, sugars: 0.7, protein: 1.1, salt: 0.7, fibre: 0.8 },
    { energy_kj: 4, energy_kcal: 1, fat: 0, saturates: 0, carbohydrate: 0.2, sugars: 0, protein: 0, salt: 0 },
    { energy_kj: 219, energy_kcal: 53, fat: 3.5, saturates: 2.4, carbohydrate: 3.9, sugars: 0.8, protein: 1, salt: 0.76 },
  ];
  it("stejná čísla jako text, vláknina zachována, nuly jako 0 g", () => {
    for (const raw of cases) {
      const text = formatNutrition(raw, "100ml")!;
      const table = nutritionTable(raw, "100ml")!;
      expect(table.basis).toBe("100 ml");
      const sort = (a: number[]) => [...a].sort((x, y) => x - y);
      expect(sort(table.rows.flatMap((r) => numbers(r.value)))).toEqual(sort(numbers(text.replace(/^na 100 ml: /, ""))));
      expect(table.rows.some((r) => r.label === "Vláknina")).toBe("fibre" in raw);
    }
    expect(nutritionTable(cases[1], "100ml")!.rows.find((r) => r.label === "Tuky")!.value).toBe("0 g");
    expect(nutritionTable(cases[2], "100ml")!.rows.find((r) => r.label === "Bílkoviny")!.value).toBe("1,0 g");
  });
  it("neúplné nebo chybějící údaje → žádná tabulka (nic se nedopočítává)", () => {
    expect(nutritionTable(null, null)).toBeNull();
    expect(nutritionTable({ energy_kj: 100, energy_kcal: 24 }, "100ml")).toBeNull();
    expect(nutritionTable(cases[0], "100g")!.basis).toBe("100 g");
  });
});

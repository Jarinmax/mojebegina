import { describe, expect, it } from "vitest";
import { withSyrupDrinkPrice } from "../syrupDrinkPrice";
import { SYRUP_MODEL_LINE, syrupDrinkRows, syrupExampleLine } from "../landingPages";
const nb = (s: string) => s.replace(/[  ]/g, " ");
describe("modelová cena nápoje ze sirupu (23. 11. 2026)", () => {
  it("jednotná věta odpovídá výpočtu 3 × 3 l s dopravou", () => {
    const row = syrupDrinkRows([3])[0];
    expect(row.totalKc).toBe(1764);
    expect(row.perPortionKc).toBe(3.92);
    expect(nb(SYRUP_MODEL_LINE)).toBe("Od 3,92 Kč za nápoj (200 ml) včetně dopravy při objednávce 3 × 3 l sirupu.");
    expect(nb(syrupExampleLine())).toBe("Tři balení po 499 Kč a chlazená doprava za 267 Kč vyjdou celkem na 1 764 Kč. Při přípravě 450 nápojů je to 3,92 Kč za porci.");
  });
  it("kategorie Sirupy: místo ceny bez dopravy cena s dopravou", () => {
    expect(nb(withSyrupDrinkPrice("Vybrat si můžete třílitrovou beginu s kohoutkem (až 150 nápojů, nápoj už od 3,30 Kč)."))).toBe(
      "Vybrat si můžete třílitrovou beginu s kohoutkem (až 150 nápojů, nápoj od 3,92 Kč (200 ml) včetně dopravy při objednávce 3 × 3 l)."
    );
  });
});

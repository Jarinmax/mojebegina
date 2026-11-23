import { describe, expect, it } from "vitest";
import { withSyrupDrinkPrice } from "../syrupDrinkPrice";
import { syrupModelLine, syrupDrinkRows, syrupExampleLine } from "../landingPages";
import { servingPrices } from "../productFacts";
const nb = (s: string) => s.replace(/[  ]/g, " ");
describe("modelová cena nápoje ze sirupu (23. 11. 2026)", () => {
  it("jednotná věta je z výpočtu tabulky 3 × 3 l s dopravou", () => {
    const row = syrupDrinkRows([3])[0];
    expect(row.totalKc).toBe(1764);
    expect(row.perPortionKc).toBe(3.92);
    expect(syrupDrinkRows([5])[0].perPortionKc).toBe(3.83);
    expect(nb(syrupModelLine())).toBe("Od 3,92 Kč za nápoj (200 ml) včetně dopravy při objednávce 3 × 3 l sirupu.");
    expect(nb(syrupExampleLine())).toBe("Tři balení po 499 Kč a chlazená doprava za 267 Kč vyjdou celkem na 1 764 Kč. Při přípravě 450 nápojů je to 3,92 Kč za porci.");
  });
  it("kategorie Sirupy: závorka rozdělená na dvě věty", () => {
    expect(nb(withSyrupDrinkPrice("Vybrat si můžete třílitrovou beginu s kohoutkem (až 150 nápojů, nápoj už od 3,30 Kč). Zázvorový a lipový sirup máme i v sáčku."))).toBe(
      "Vybrat si můžete třílitrovou beginu s kohoutkem. Z jedné třílitrové beginy připravíte až 150 nápojů. Při objednávce 3 × 3 l vyjde jeden nápoj o objemu 200 ml od 3,92 Kč včetně dopravy. Zázvorový a lipový sirup máme i v sáčku."
    );
  });
  it("detail sirupu: cena nápoje s „bez dopravy“", () => {
    const p = { category: "sirupy", variants: [{ sku: "x", label: "3 l", priceKc: 499, volumeMl: 3000, servings: 150 }] } as any;
    expect(nb(servingPrices(p)[0].text)).toBe("Nápoj 200 ml za 3,33 Kč bez dopravy");
  });
});

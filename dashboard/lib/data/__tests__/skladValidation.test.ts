// Security Phase 22 (Sklad 1.0 — bezpečný základ) — testy čisté logiky
// (bez DB, bez "server-only"), stejná konvence jako
// dailyCallsValidation.test.ts.
import { describe, expect, it } from "vitest";
import {
  computeNormalizedQuantity,
  computeVatRatePercent,
  isValidIco,
  normalizeText,
  parseDecimal,
  parseHaler,
  validateManualLineInput,
  validateStockItemInput,
  validateSupplierInput,
  validateVatReviewInput,
  type ManualLineInput,
} from "../skladValidation";

describe("computeVatRatePercent — DPH se vždy DOPOČÍTÁ z částek, nikdy nečte z kódu", () => {
  // Čísla tady jsou syntetická (ne přepis reálné faktury), ale ilustrují
  // přesně nález z reálné faktury Makro: sloupec vedle ceny (23/6) byl
  // nerozkódovaný dodavatelský kód oddělení, NE sazba DPH — přepočet ze
  // skutečných částek dal 21 %, resp. 12 %. Odtud požadavek "DPH urči z
  // částek, nikdy z tohoto sloupce" (revize návrhu, bod 2).
  it("částky dávající 21 % se nesmí zaměnit za dodavatelský kód '23'", () => {
    expect(computeVatRatePercent(17700, 21417)).toBeCloseTo(21, 0);
  });

  it("částky dávající 12 % se nesmí zaměnit za dodavatelský kód '6'", () => {
    expect(computeVatRatePercent(10000, 11200)).toBe(12);
  });

  it("nulová částka bez DPH nedělí nulou, vrátí 0", () => {
    expect(computeVatRatePercent(0, 0)).toBe(0);
  });

  it("shoda částek → 0 %", () => {
    expect(computeVatRatePercent(10000, 10000)).toBe(0);
  });
});

describe("computeNormalizedQuantity", () => {
  it("balení × jednotky v balení (karton 2 balení × 12 ks = 24 ks)", () => {
    expect(computeNormalizedQuantity(2, 12)).toBe(24);
  });

  it("vážené zboží s desetinným množstvím (1 balení × 1,142 kg)", () => {
    expect(computeNormalizedQuantity(1, 1.142)).toBeCloseTo(1.142, 6);
  });
});

describe("parseHaler / parseDecimal — český i anglický formát čísla", () => {
  it("parseHaler přijme čárku i tečku a zaokrouhlí na haléře", () => {
    expect(parseHaler("177,00")).toBe(17700);
    expect(parseHaler("177.00")).toBe(17700);
    expect(parseHaler("177,005")).toBe(17701); // zaokrouhlení nahoru
  });

  it("parseHaler vrátí null na neplatný vstup", () => {
    expect(parseHaler("")).toBeNull();
    expect(parseHaler("abc")).toBeNull();
  });

  it("parseDecimal zachová přesnost beze zaokrouhlení na haléře", () => {
    expect(parseDecimal("1,142")).toBeCloseTo(1.142, 6);
    expect(parseDecimal("177,123456")).toBeCloseTo(177.123456, 6);
  });
});

describe("isValidIco", () => {
  it("přijme přesně 8 číslic", () => {
    expect(isValidIco("74337297")).toBe(true);
  });

  it("odmítne jiný formát", () => {
    expect(isValidIco("7433729")).toBe(false);
    expect(isValidIco("743372977")).toBe(false);
    expect(isValidIco("CZ743372")).toBe(false);
  });
});

describe("normalizeText", () => {
  it("ořeže a sjednotí bílé znaky, převede na malá písmena", () => {
    expect(normalizeText("  Makro   Cash & Carry ČR  ")).toBe("makro cash & carry čr");
  });
});

function baseManualLine(overrides: Partial<ManualLineInput> = {}): ManualLineInput {
  return {
    rawDescription: "Tlačenka světlá speciál",
    supplierItemCode: "12345",
    supplierAuxiliaryCode: "23",
    rawPackageQuantity: "1",
    rawUnitsPerPackage: "1,142",
    rawUnit: "kg",
    normalizedUnit: "kg",
    unitPriceWithoutVat: "155,00",
    totalWithoutVatHal: "177,00",
    totalWithVatHal: "214,17",
    lineKind: "stock_material",
    stockItemId: "11111111-1111-1111-1111-111111111111",
    ...overrides,
  };
}

describe("validateManualLineInput", () => {
  it("platný vstup: vatHal se DOPOČÍTÁ jako rozdíl celkových částek, ne jako samostatné pole", () => {
    const result = validateManualLineInput(baseManualLine());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.vatHal).toBe(21417 - 17700);
      expect(result.value.totalWithVatHal).toBe(result.value.totalWithoutVatHal + result.value.vatHal);
      expect(result.value.computedVatRatePercent).toBeCloseTo(21, 0);
      expect(result.value.normalizedQuantity).toBeCloseTo(1.142, 6);
    }
  });

  it("odmítne prázdný popis", () => {
    const result = validateManualLineInput(baseManualLine({ rawDescription: "  " }));
    expect(result.ok).toBe(false);
  });

  it("odmítne nekladné množství balení", () => {
    const result = validateManualLineInput(baseManualLine({ rawPackageQuantity: "0" }));
    expect(result.ok).toBe(false);
  });

  it("odmítne cenu s DPH nižší než cenu bez DPH", () => {
    const result = validateManualLineInput(baseManualLine({ totalWithVatHal: "10000", totalWithoutVatHal: "17700" }));
    expect(result.ok).toBe(false);
  });

  it("odmítne neplatný druh položky", () => {
    const result = validateManualLineInput(baseManualLine({ lineKind: "neznamy_druh" }));
    expect(result.ok).toBe(false);
  });

  it("soukromá/nefiremní položka (non_stock_private) nesmí mít skladovou kartu", () => {
    const result = validateManualLineInput(
      baseManualLine({ lineKind: "non_stock_private", stockItemId: "11111111-1111-1111-1111-111111111111" })
    );
    expect(result.ok).toBe(false);
  });

  it("soukromá/nefiremní položka bez skladové karty je v pořádku", () => {
    const result = validateManualLineInput(baseManualLine({ lineKind: "non_stock_private", stockItemId: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stockItemId).toBeNull();
    }
  });

  it("skladová/zbožová položka bez skladové karty je odmítnuta", () => {
    const result = validateManualLineInput(baseManualLine({ stockItemId: "" }));
    expect(result.ok).toBe(false);
  });
});

describe("validateSupplierInput", () => {
  it("platné IČO i bez IČO (jen název)", () => {
    expect(validateSupplierInput({ name: "Makro Cash & Carry ČR", ico: "", dic: "" }).ok).toBe(true);
    expect(validateSupplierInput({ name: "Makro Cash & Carry ČR", ico: "74337297", dic: "CZ8005124303" }).ok).toBe(
      true
    );
  });

  it("odmítne neplatný formát IČO", () => {
    const result = validateSupplierInput({ name: "Test", ico: "12AB", dic: "" });
    expect(result.ok).toBe(false);
  });

  it("odmítne prázdný název", () => {
    expect(validateSupplierInput({ name: "  ", ico: "", dic: "" }).ok).toBe(false);
  });
});

describe("validateStockItemInput", () => {
  it("platný vstup", () => {
    const result = validateStockItemInput({ name: "Pivo 12°", canonicalUnit: "l", kind: "resale_goods" });
    expect(result.ok).toBe(true);
  });

  it("odmítne neplatný formát kanonické jednotky", () => {
    const result = validateStockItemInput({ name: "Pivo 12°", canonicalUnit: "Litr!", kind: "resale_goods" });
    expect(result.ok).toBe(false);
  });

  it("odmítne neplatný druh", () => {
    const result = validateStockItemInput({ name: "Pivo 12°", canonicalUnit: "l", kind: "neznamy" });
    expect(result.ok).toBe(false);
  });
});

describe("validateVatReviewInput — post-implementační audit, bod A", () => {
  it("platný vstup dopočítá vatHal a sazbu, stejně jako ruční zadání řádku", () => {
    const result = validateVatReviewInput({ totalWithoutVatHal: "177,00", totalWithVatHal: "214,17" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.vatHal).toBe(21417 - 17700);
      expect(result.value.computedVatRatePercent).toBeCloseTo(21, 0);
    }
  });

  it("odmítne cenu s DPH nižší než cenu bez DPH", () => {
    const result = validateVatReviewInput({ totalWithoutVatHal: "200,00", totalWithVatHal: "100,00" });
    expect(result.ok).toBe(false);
  });

  it("odmítne neplatný/chybějící vstup", () => {
    expect(validateVatReviewInput({ totalWithoutVatHal: "", totalWithVatHal: "100,00" }).ok).toBe(false);
    expect(validateVatReviewInput({ totalWithoutVatHal: "100,00", totalWithVatHal: "" }).ok).toBe(false);
  });
});

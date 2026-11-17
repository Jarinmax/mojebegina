import { describe, expect, it } from "vitest";
import {
  afterOpening,
  afterOpeningBadge,
  afterOpeningLine,
  formatPerLitre,
  formatServingKc,
  hasPreservative,
  highlightAllergens,
  servingPrices,
  showsNoPreservatives,
  undeclaredAllergenWords,
  withoutServingPrice,
} from "../productFacts";
import type { Product } from "../types";

const FRIDGE = "Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.";
const shelf = (what: string) => `Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do ${what} při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.`;

function product(over: Partial<Product> & { shelfLife?: string | null; storage?: string | null; ingredients?: string | null; allergens?: string[] | null }): Product {
  return {
    slug: "x",
    name: "X",
    category: "polevky",
    shortDescription: null,
    highlights: [],
    description: [],
    taste: null,
    warnings: [],
    image: null,
    variants: [{ sku: "a", label: "3 l", detail: null, description: null, priceKc: 379, volumeMl: 3000, servings: 12, weightGrams: null }],
    alcoholPercent: null,
    isAgeRestricted: false,
    ...over,
    foodInfo: {
      ingredients: over.ingredients === undefined ? "voda, brambory" : over.ingredients,
      allergens: over.allergens === undefined ? [] : over.allergens,
      nutritionPer100g: null,
      storage: over.storage === undefined ? FRIDGE : over.storage,
      shelfLife: over.shelfLife === undefined ? shelf("14 dnů") : over.shelfLife,
    },
  };
}

const nbsp = (text: string | null) => (text ?? "").replace(/ /g, " ");

describe("trvanlivost po otevření", () => {
  it("čte dny i měsíce z textu trvanlivosti, jinak nic", () => {
    expect(afterOpening(shelf("14 dnů"))).toEqual({ amount: 14, unit: "days" });
    expect(afterOpening(shelf("3 měsíců"))).toEqual({ amount: 3, unit: "months" });
    expect(afterOpening(shelf("5 dnů"))).toEqual({ amount: 5, unit: "days" });
    expect(afterOpening("Spotřebujte do data na obalu.")).toBeNull();
    expect(afterOpening(null)).toBeNull();
  });

  it("štítek a řádek podle kategorie", () => {
    expect(nbsp(afterOpeningBadge(product({})))).toBe("14 dní po otevření");
    expect(nbsp(afterOpeningLine(product({})))).toBe("Po otevření vydrží v lednici 14 dní – natáčíte postupně.");
    expect(nbsp(afterOpeningLine(product({ category: "caje" })))).toBe("Po otevření vydrží v lednici 14 dní – natáčíte postupně.");
    const syrup = product({ category: "sirupy", shelfLife: shelf("3 měsíců"), storage: "Před otevřením skladujte v suchu. Po otevření uchovávejte v chladničce při teplotě do 4 °C." });
    expect(nbsp(afterOpeningBadge(syrup))).toBe("3 měsíce po otevření");
    expect(nbsp(afterOpeningLine(syrup))).toBe("Po otevření vydrží v lednici 3 měsíce.");
    expect(nbsp(afterOpeningLine(product({ category: "ovocne-napoje", shelfLife: shelf("5 dnů") })))).toBe("Po otevření vydrží v lednici 5 dní.");
  });

  it("bez údaje se nic nezobrazí; „v lednici“ jen podle skladování", () => {
    expect(afterOpeningBadge(product({ shelfLife: null }))).toBeNull();
    expect(afterOpeningLine(product({ shelfLife: null }))).toBeNull();
    expect(nbsp(afterOpeningLine(product({ category: "sirupy", storage: "V suchu." })))).toBe("Po otevření vydrží 14 dní.");
  });
});

describe("cena za porci", () => {
  it("zaokrouhlení a měrná cena", () => {
    expect(nbsp(formatServingKc(379 / 12))).toBe("31,60 Kč");
    expect(nbsp(formatServingKc(549 / 150))).toBe("3,70 Kč");
    expect(nbsp(formatServingKc(499 / 150))).toBe("3,30 Kč");
    expect(nbsp(formatPerLitre(379, 3000))).toBe("126 Kč/l");
  });

  it("polévka, sirup se dvěma baleními, koktejl bez počtu porcí", () => {
    expect(servingPrices(product({})).map((row) => ({ ...row, text: nbsp(row.text) }))).toEqual([{ label: null, text: "Porce 250 ml za 31,60 Kč · 126 Kč/l" }]);
    const syrup = product({
      category: "sirupy",
      variants: [
        { sku: "a", label: "3 l", detail: null, description: null, priceKc: 549, volumeMl: 3000, servings: 150, weightGrams: null },
        { sku: "b", label: "650 ml", detail: null, description: null, priceKc: 199, volumeMl: 650, servings: 32, weightGrams: null },
      ],
    });
    expect(servingPrices(syrup).map((row) => ({ ...row, text: nbsp(row.text) }))).toEqual([
      { label: "3 l", text: "Sklenice limonády za 3,70 Kč" },
      { label: "650 ml", text: "Sklenice limonády za 6,20 Kč" },
    ]);
    const cocktail = product({
      category: "koktejly",
      variants: [
        { sku: "a", label: "3 l", detail: null, description: null, priceKc: 799, volumeMl: 3000, servings: 15, weightGrams: null },
        { sku: "b", label: "500 ml", detail: null, description: null, priceKc: 169, volumeMl: 500, servings: null, weightGrams: null },
      ],
    });
    expect(servingPrices(cocktail).map((row) => ({ ...row, text: nbsp(row.text) }))).toEqual([
      { label: "3 l", text: "Sklenice 200 ml za 53,30 Kč · 266 Kč/l" },
      { label: "500 ml", text: "Sklenice 200 ml za 67,60 Kč · 338 Kč/l" },
    ]);
    expect(servingPrices(product({ variants: [{ sku: "a", label: "3 l", detail: null, description: null, priceKc: 379, volumeMl: null, servings: 12, weightGrams: null }] }))).toEqual([]);
  });
});

describe("alergeny ve složení", () => {
  const wine = "červené víno 63 % (obsahuje SIŘIČITANY), pomerančová šťáva 13 %";
  it("tučně jen alergeny uvedené u produktu", () => {
    expect(highlightAllergens(wine, ["oxid siřičitý a siřičitany"])).toEqual([
      { text: "červené víno 63 % (obsahuje ", bold: false },
      { text: "SIŘIČITANY", bold: true },
      { text: "), pomerančová šťáva 13 %", bold: false },
    ]);
    expect(highlightAllergens(wine, [])).toEqual([{ text: wine, bold: false }]);
    expect(highlightAllergens("pšeničná mouka, celer, sójová omáčka", ["obiloviny obsahující lepek", "celer"]).filter((s) => s.bold).map((s) => s.text)).toEqual(["pšeničná", "celer"]);
  });

  it("kokosové mléko a muškátový oříšek nejsou alergeny", () => {
    const soup = "dýně 41 %, kokosové mléko 14 % (kokosový extrakt 85 %), muškátový oříšek, kořen petržele, libeček";
    expect(highlightAllergens(soup, ["mléko", "skořápkové plody", "celer"])).toEqual([{ text: soup, bold: false }]);
    expect(undeclaredAllergenWords(soup, [])).toEqual([]);
    expect(undeclaredAllergenWords("smetana, mléko, kokosové mléko", [])).toEqual(["smetana", "mléko"]);
    expect(undeclaredAllergenWords(wine, [])).toEqual(["SIŘIČITANY"]);
    expect(undeclaredAllergenWords(wine, ["oxid siřičitý a siřičitany"])).toEqual([]);
  });
});

describe("bez konzervantů", () => {
  it("siřičitany, slovo konzervant a E 2xx jsou konzervant; antioxidant a emulgátor ne", () => {
    expect(hasPreservative("červené víno (obsahuje SIŘIČITANY)")).toBe(true);
    expect(hasPreservative("voda, konzervant: sorban draselný")).toBe(true);
    expect(hasPreservative("voda, E 202")).toBe(true);
    expect(hasPreservative("voda, emulgátor: E 435, antioxidant: kyselina askorbová (vitamin C), regulátor kyselosti: kyselina citronová, barviva: E 110, E 124")).toBe(false);
    expect(showsNoPreservatives(product({}))).toBe(true);
    expect(showsNoPreservatives(product({ ingredients: null }))).toBe(false);
    expect(showsNoPreservatives(product({ ingredients: "víno (SIŘIČITANY)" }))).toBe(false);
    // Lady Carneval: konzervant nemá, ale vedle barviv E 110 a E 124 se štítek neukazuje
    expect(showsNoPreservatives(product({ ingredients: "voda, vodka 15 %, Aperol 8 % (pitná voda, cukr, líh, aromata, barviva: E 110, E 124)" }))).toBe(false);
  });

  it("krátký popis bez ceny za porci, jinak beze změny", () => {
    expect(withoutServingPrice("Až 12 porcí polévky (31,60 Kč za porci). Jedna porce = 250 ml.")).toBe("Až 12 porcí polévky. Jedna porce = 250 ml.");
    expect(withoutServingPrice("3 l: až 150 nápojů (cca 3,70 Kč za nápoj). 650 ml: až 32 nápojů. Při ředění 1 : 10.")).toBe("3 l: až 150 nápojů. 650 ml: až 32 nápojů. Při ředění 1 : 10.");
    expect(withoutServingPrice("Až 15 nápojů (26,60 Kč za nápoj). Jeden nápoj = 200 ml.")).toBe("Až 15 nápojů. Jeden nápoj = 200 ml.");
    expect(withoutServingPrice("Až 12 nápojů (29 Kč za nápoj). Jeden nápoj = 250 ml.")).toBe("Až 12 nápojů. Jeden nápoj = 250 ml.");
    expect(withoutServingPrice("Grepový koktejl s vodkou a Aperolem.")).toBe("Grepový koktejl s vodkou a Aperolem.");
    expect(withoutServingPrice(null)).toBeNull();
  });
});

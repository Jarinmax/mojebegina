import { describe, expect, it } from "vitest";
import { buildSkSheet, SK_FOOD_INFO } from "../skFoodInfo";

const STORAGE = "Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.";
const base = { name: "Šípkový sirup", allergens: [], storage: STORAGE, shelfLife: null, warnings: [] };

describe("slovenské listy", () => {
  it("vydá list jen pro aktuální české složení", () => {
    const source = SK_FOOD_INFO["sipkovy-sirup"].sourceCz;
    expect(source).toBe("třtinový cukr, bylinný výluh 40 % (čistá filtrovaná voda, šípek (Rosa canina)), citronová šťáva 9 %, antioxidant: kyselina askorbová (vitamin C)");
    const sheet = buildSkSheet({ ...base, slug: "sipkovy-sirup", ingredients: source });
    expect(sheet).toMatchObject({ status: "ok", nameSk: "Šípkový sirup", problems: [] });
    if (sheet.status === "ok") {
      expect(sheet.ingredientsSk).toContain("trstinový cukor, bylinný výluh 40 %");
      expect(sheet.storageSk).toContain("Pred otvorením");
    }
    expect(buildSkSheet({ ...base, slug: "sipkovy-sirup", ingredients: source.replace("9 %", "10 %") })).toEqual({ status: "stale" });
    expect(buildSkSheet({ ...base, slug: "produkt-bez-prekladu", ingredients: "dýně" })).toEqual({ status: "missing" });
  });
  it("nepřeložené alergeny a věty hlásí, nezamlčí", () => {
    const sheet = buildSkSheet({ ...base, slug: "sipkovy-sirup", ingredients: SK_FOOD_INFO["sipkovy-sirup"].sourceCz, allergens: ["celer"], warnings: ["Nová věta."] });
    expect(sheet.status).toBe("ok");
    if (sheet.status === "ok") expect(sheet.problems).toHaveLength(2);
    const unknown = buildSkSheet({ ...base, slug: "sipkovy-sirup", ingredients: SK_FOOD_INFO["sipkovy-sirup"].sourceCz, allergens: null });
    if (unknown.status === "ok") expect(unknown.problems[0]).toContain("nejsou v katalogu vyplněné");
  });
  it("procenta v překladu odpovídají českému zdroji", () => {
    for (const info of Object.values(SK_FOOD_INFO)) {
      expect(info.ingredientsSk.match(/\d+ %/g)).toEqual(info.sourceCz.match(/\d+ %/g));
    }
  });
});

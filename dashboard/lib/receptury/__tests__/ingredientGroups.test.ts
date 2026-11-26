import { describe, expect, it } from "vitest";
import { ingredientGroupKey, packagingSectionKey } from "../ingredientGroups";

describe("skupiny ceníku", () => {
  it.each([
    ["Bag 3 l (begina bez krabice)", "obal", "obaly"],
    ["Esenciální olej grep", "surovina", "aroma"],
    ["Grepová šťáva", "surovina", "stavy"],
    ["Šťáva z granátového jablka", "surovina", "stavy"],
    ["Červené víno", "surovina", "alkohol"],
    ["Lipový květ", "surovina", "byliny"],
    ["Černý čaj Golden Nepal", "surovina", "byliny"],
    ["Pasírovaná rajčata", "surovina", "zelenina"],
    ["Kopr čerstvý", "surovina", "zelenina"],
    ["Zázvor sušený mletý", "surovina", "koreni"],
    ["Mořská sůl", "surovina", "koreni"],
    ["Třtinový cukr", "surovina", "cukr"],
    ["Kokosové mléko Real Thai", "surovina", "cukr"],
    ["Dýňový olej", "surovina", "cukr"],
    ["Čistá filtrovaná voda", "surovina", "cukr"],
    ["Kyselina askorbová (vitamin C)", "surovina", "cukr"],
  ])("%s → %s", (name, kind, group) => {
    expect(ingredientGroupKey(name, kind)).toBe(group);
  });
});

describe("obaly v sekcích (Lucie 27. 11. 2026)", () => {
  it("bagy a krabice, kapsičky, etikety", () => {
    expect(packagingSectionKey("Bag 3 l (begina bez krabice)")).toBe("bagy");
    expect(packagingSectionKey("Krabice 3 l")).toBe("bagy");
    expect(packagingSectionKey("Kapsička stříbrná na sirup 500 ml")).toBe("kapsicky");
    expect(packagingSectionKey("Etiketa složení (černobílá DK-22212, 12 cm)")).toBe("etikety");
    expect(packagingSectionKey("Páska")).toBe("ostatni");
  });
});

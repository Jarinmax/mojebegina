import { describe, expect, it } from "vitest";
import { ingredientGroupKey } from "../ingredientGroups";

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

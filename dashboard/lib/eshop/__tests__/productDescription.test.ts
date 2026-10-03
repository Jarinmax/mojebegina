// Popis produktu s jednoduchým formátováním (texty z begina.cz).
import { describe, expect, it } from "vitest";
import { parseDescription, splitBold } from "../productDescription";

describe("popis produktu", () => {
  it("úvodní odstavce, sekce ## a odrážky -", () => {
    expect(
      parseDescription([
        "První odstavec.",
        "**Tučný odstavec.**",
        "## Pro koho je vhodný",
        "- **A:** jedna",
        "- **B:** dvě",
        "## Jak sirup používat",
        "- limonáda",
        "**Zlaté pravidlo:** 1:10",
        "- další seznam",
        "  ",
      ])
    ).toEqual({
      intro: [
        { type: "p", text: "První odstavec." },
        { type: "p", text: "**Tučný odstavec.**" },
      ],
      sections: [
        { title: "Pro koho je vhodný", blocks: [{ type: "ul", items: ["**A:** jedna", "**B:** dvě"] }] },
        {
          title: "Jak sirup používat",
          blocks: [
            { type: "ul", items: ["limonáda"] },
            { type: "p", text: "**Zlaté pravidlo:** 1:10" },
            { type: "ul", items: ["další seznam"] },
          ],
        },
      ],
    });
  });

  it("dosavadní popisy bez formátování = jen úvod, beze změny", () => {
    expect(parseDescription(["Jeden.", "Dva."])).toEqual({
      intro: [
        { type: "p", text: "Jeden." },
        { type: "p", text: "Dva." },
      ],
      sections: [],
    });
  });

  it("tučně uvnitř textu; neuzavřené hvězdičky zůstanou textem", () => {
    expect(splitBold("Použijte **20 ml** na **200 ml vody**.")).toEqual([
      { text: "Použijte ", bold: false },
      { text: "20 ml", bold: true },
      { text: " na ", bold: false },
      { text: "200 ml vody", bold: true },
      { text: ".", bold: false },
    ]);
    expect(splitBold("50 ** 2")).toEqual([{ text: "50 ** 2", bold: false }]);
  });
});

import { describe, expect, it } from "vitest";
import { withSoupPackLead } from "../soupPackFaq";

const nbsp = (s: string | undefined) => (s ?? "").replace(/\s/g, " ");

describe("Časté otázky – ochutnávka polévek na začátku", () => {
  const items = [
    { question: "Jak dlouho vydrží polévka po otevření?", answer: "A." },
    { question: "Jak ochutnat polévky a sirupy?", answer: "K první třílitrové begině Vám přibalíme…" },
  ];
  it("doplní úvodní větu, ceny a odkaz jen k otázce o ochutnávce", () => {
    const out = withSoupPackLead(items, { priceKc: 299, totalKc: 566 });
    expect(out[0].lead).toBeUndefined();
    expect(nbsp(out[1].lead)).toBe("Chcete ochutnat jen polévky? Vyberte si tři různé druhy po 450 ml. Při osobním odběru ve Viticích stojí sada 299 Kč, s chlazenou dopravou po ČR celkem 566 Kč.");
    expect(out[1].link).toEqual({ label: "Vybrat 3 polévky", href: "/produkt/ochutnavka-polevek-3x450" });
    expect(out[1].rest).toBe(items[1].answer);
    expect(out[1].answer.endsWith(items[1].answer)).toBe(true);
  });
  it("bez sady v katalogu beze změny", () => {
    expect(withSoupPackLead(items, null)[1].answer).toBe(items[1].answer);
  });
});

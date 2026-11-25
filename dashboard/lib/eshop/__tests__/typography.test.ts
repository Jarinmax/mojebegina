// Typografie tabulky „Informace o potravině“ (10. 11. 2026): jen zápis,
// obsah beze změny.
import { describe, expect, it } from "vitest";
import { asSentence, czechNbsp, keepTogether, splitLastSentence } from "../typography";

const NB = " ";

describe("typografie Informací o potravině", () => {
  it("seznam složení: velké písmeno a tečka, obsah beze změny, E 435 pohromadě", () => {
    const raw = "čistá filtrovaná voda, dýně 39 %, kokosové mléko 15 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), sůl";
    const out = asSentence(raw)!;
    expect(out).toBe(`Čistá filtrovaná voda, dýně 39${NB}%, kokosové mléko 15${NB}% (kokosový extrakt 85${NB}%, pitná voda, emulgátor: E${NB}435), sůl.`);
    expect(out.replaceAll(NB, " ").toLocaleLowerCase("cs")).toBe(`${raw}.`.toLocaleLowerCase("cs"));
  });

  it("výživa souvislým textem: „Na 100 ml:“ … tečka; čísla a jednotky pohromadě", () => {
    expect(asSentence("na 100 ml: energie 1 105 kJ / 260 kcal, tuky 0 g, sůl 0,8 g")).toBe(
      `Na 100${NB}ml: energie 1 105${NB}kJ / 260${NB}kcal, tuky 0${NB}g, sůl 0,8${NB}g.`
    );
    expect(asSentence("na 100 g: energie 283 kJ")!.startsWith(`Na 100${NB}g:`)).toBe(true);
  });

  it("věta s tečkou dostane jen nezalomitelné mezery, žádnou další tečku", () => {
    expect(asSentence("Po otevření spotřebujte do 14 dnů při skladování do 4 °C.")).toBe(`Po otevření spotřebujte do 14${NB}dnů při skladování do 4${NB}°C.`);
    expect(asSentence("Před použitím protřepejte!")).toBe("Před použitím protřepejte!");
  });

  it("prázdná hodnota zůstane prázdná (Doplníme); zápis bez mezery se nemění", () => {
    expect(asSentence(null)).toBeNull();
    expect(asSentence("  ")).toBeNull();
    expect(keepTogether("barviva: E110, E124")).toBe("barviva: E110, E124");
  });
});

describe("splitLastSentence", () => {
  it("poslední věta zvlášť", () => {
    expect(splitLastSentence("Stačí zalít vodou v poměru přibližně 1 : 10 – studenou na limonádu, horkou na čaj. Hodí se i do koktejlů a do kuchyně.")).toEqual([
      "Stačí zalít vodou v poměru přibližně 1 : 10 – studenou na limonádu, horkou na čaj.",
      "Hodí se i do koktejlů a do kuchyně.",
    ]);
    expect(splitLastSentence("Ovocné nápoje mícháme z vody. Bez přidaného cukru – obsahují jen přirozeně přítomné cukry z ovoce.")[1]).toBe("Bez přidaného cukru – obsahují jen přirozeně přítomné cukry z ovoce.");
    expect(splitLastSentence("Jediná věta.")).toEqual(["Jediná věta.", null]);
  });
});

describe("czechNbsp", () => {
  it("drží jednopísmenné předložky a spojky u dalšího slova", () => {
    expect(czechNbsp("cukry z ovoce a v létě s ledem")).toBe("cukry z ovoce a v létě s ledem");
    expect(czechNbsp("V létě i v zimě")).toBe("V létě i v zimě");
  });
  it("nemění delší slova ani písmena uvnitř slov", () => {
    expect(czechNbsp("Polévky ze zeleniny, 3 l balení")).toBe("Polévky ze zeleniny, 3 l balení");
  });
});

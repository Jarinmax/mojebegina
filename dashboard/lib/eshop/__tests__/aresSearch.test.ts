import { describe, expect, it } from "vitest";
import { aresAddressLine, parseAresSearch, searchAresByName } from "../ares";

const sample = {
  pocetCelkem: 2,
  ekonomickeSubjekty: [
    {
      ico: "10691731",
      obchodniJmeno: "Starý Chřestýš s.r.o.",
      dic: "CZ10691731",
      sidlo: { nazevUlice: "Mostecká", cisloDomovni: 273, cisloOrientacni: 21, nazevObce: "Praha", psc: 11800 },
    },
    { ico: "bad", obchodniJmeno: "Bez IČO" },
    { ico: "12345678", obchodniJmeno: "Vesnice s.r.o.", sidlo: { nazevObce: "Vitice", cisloDomovni: 119, psc: 28106 } },
  ],
};

describe("ARES – převod leadu na zákazníka", () => {
  it("parsuje výsledky vyhledávání podle názvu", () => {
    const companies = parseAresSearch(sample);
    expect(companies.map((c) => c.ico)).toEqual(["10691731", "12345678"]);
    expect(companies[0].dic).toBe("CZ10691731");
  });

  it("skládá adresu sídla na jeden řádek", () => {
    const [praha, vitice] = parseAresSearch(sample);
    expect(aresAddressLine(praha)).toBe("Mostecká 273/21, 118 00 Praha");
    expect(aresAddressLine(vitice)).toBe("Vitice 119, 281 06");
  });

  it("vyhledá podle názvu přes POST /vyhledat", async () => {
    let body: unknown = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      expect(url).toMatch(/\/vyhledat$/);
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(sample), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await searchAresByName("Starý Chřestýš", fetchImpl);
    expect(body).toMatchObject({ obchodniJmeno: "Starý Chřestýš", start: 0 });
    expect(result.ok && result.companies.length).toBe(2);
  });

  it("krátký dotaz nevolá ARES, výpadek hlásí jako unavailable", async () => {
    const never = (async () => {
      throw new Error("nemá se volat");
    }) as unknown as typeof fetch;
    expect(await searchAresByName("ab", never)).toEqual({ ok: true, companies: [] });
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    expect(await searchAresByName("Begina", down)).toEqual({ ok: false, reason: "unavailable" });
  });
});

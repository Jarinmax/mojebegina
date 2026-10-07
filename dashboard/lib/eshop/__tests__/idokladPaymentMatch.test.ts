// ESHOP 1.0 — regrese 7. 10. 2026 (dvě ostrá read-only spuštění proti
// skutečné agendě Beginy): dřívější předpoklady (země "CZE", české názvy
// způsobů úhrady, a že "cash"/"hotov" samo stačí na jednoznačnou shodu)
// v reálném API neplatí. Tenhle test ověřuje přímo PAYMENT_OPTION_MATCH
// a CZECH_REPUBLIC_COUNTRY_CODE (lib/eshop/invoicing/idoklad.ts) proti
// přesně té odpovědi, co agenda Beginy skutečně vrátila — bez DB/PGlite,
// čistá synchronní kontrola.
import { describe, expect, it } from "vitest";
import { CZECH_REPUBLIC_COUNTRY_CODE, PAYMENT_OPTION_MATCH } from "../invoicing/idoklad";

// Přesně odpověď GET /PaymentOptions z agendy Beginy (ověřeno živě
// 7. 10. 2026, druhé spuštění doplnilo "Cash on delivery").
const BEGINA_PAYMENT_OPTIONS = [
  { Id: 1, Name: "Bank transfer", Code: "B", IsDefault: true },
  { Id: 2, Name: "Credit card", Code: "P", IsDefault: false },
  { Id: 3, Name: "Cash", Code: "H", IsDefault: false },
  { Id: 4, Name: "Cash on delivery", Code: "D", IsDefault: false },
];

type Option = { Id: number; Name: string; Code?: string; IsDefault?: boolean };

function matchIds(rule: { name: RegExp; exclude: RegExp }, options: Option[]) {
  return options.filter((o) => rule.name.test(o.Name) && !rule.exclude.test(o.Name)).map((o) => o.Id);
}

describe("CZECH_REPUBLIC_COUNTRY_CODE — regrese CZE→CZ", () => {
  it("je ISO ALPHA-2 \"CZ\", ne dřívější chybné \"CZE\"", () => {
    expect(CZECH_REPUBLIC_COUNTRY_CODE).toBe("CZ");
  });
});

describe("PAYMENT_OPTION_MATCH — skutečná odpověď agendy Beginy (anglické názvy, 4 položky)", () => {
  it("bank_transfer najde právě 'Bank transfer', ne víc, ne nic", () => {
    expect(matchIds(PAYMENT_OPTION_MATCH.bank_transfer, BEGINA_PAYMENT_OPTIONS)).toEqual([1]);
  });

  it("card najde právě 'Credit card', ne víc, ne nic", () => {
    expect(matchIds(PAYMENT_OPTION_MATCH.card, BEGINA_PAYMENT_OPTIONS)).toEqual([2]);
  });

  // regrese druhého ostrého spuštění: "Cash on delivery" (ID 4, dobírka)
  // obsahuje samostatné slovo "cash", takže bez vyloučení by "hotově"
  // vycházelo nejednoznačně (2 shody). Dobírka a platba v hotovosti na
  // místě jsou dvě různé věci — "hotově" musí najít JEN Cash.
  it("cash najde právě 'Cash' (ID 3), NE 'Cash on delivery' (ID 4)", () => {
    expect(matchIds(PAYMENT_OPTION_MATCH.cash, BEGINA_PAYMENT_OPTIONS)).toEqual([3]);
  });

  it("žádná metoda nekoliduje s jinou ve skutečné čtyřpoložkové sadě (tři různé ID, žádné prázdné, dobírka nikde)", () => {
    const all = Object.values(PAYMENT_OPTION_MATCH).map((m) => matchIds(m, BEGINA_PAYMENT_OPTIONS));
    expect(all.every((ids) => ids.length === 1)).toBe(true);
    expect(new Set(all.map((ids) => ids[0])).size).toBe(3);
    expect(all.flat()).not.toContain(4); // "Cash on delivery" nepatří žádné ze tří metod
  });

  it("pořád funguje i na starší české názvy (zpětná kompatibilita s jinou agendou)", () => {
    const czechOptions: Option[] = [
      { Id: 10, Name: "Převodem", Code: "B", IsDefault: true },
      { Id: 11, Name: "Kartou", Code: "K", IsDefault: false },
      { Id: 12, Name: "Hotově", Code: "H", IsDefault: false },
    ];
    expect(matchIds(PAYMENT_OPTION_MATCH.bank_transfer, czechOptions)).toEqual([10]);
    expect(matchIds(PAYMENT_OPTION_MATCH.card, czechOptions)).toEqual([11]);
    expect(matchIds(PAYMENT_OPTION_MATCH.cash, czechOptions)).toEqual([12]);
  });

  // český ekvivalent téže kolize — "Hotově při doručení" a "Dobírka" obsahují
  // "hotov"/jsou dobírkového typu a nesmí se zaměnit za prostou platbu v hotovosti.
  it("české 'Hotově' nezamění za 'Hotově při doručení' ani za 'Dobírka'", () => {
    const withCzechCod: Option[] = [
      { Id: 20, Name: "Hotově", Code: "H" },
      { Id: 21, Name: "Hotově při doručení", Code: "D" },
      { Id: 22, Name: "Dobírka", Code: "D2" },
    ];
    expect(matchIds(PAYMENT_OPTION_MATCH.cash, withCzechCod)).toEqual([20]);
  });

  it("Code se nepoužívá jako rozhodující pole — karta má v Begině 'P', ne dřív předpokládané 'K'", () => {
    const card = BEGINA_PAYMENT_OPTIONS.find((o) => o.Id === 2)!;
    expect(card.Code).toBe("P");
    expect(matchIds(PAYMENT_OPTION_MATCH.card, BEGINA_PAYMENT_OPTIONS)).toEqual([2]);
  });

  it("nesouvisející způsob úhrady bez 'cash'/'kart'/'převod' v názvu nekoliduje", () => {
    const withVoucher = [...BEGINA_PAYMENT_OPTIONS, { Id: 5, Name: "Poukázka", Code: "V", IsDefault: false }];
    expect(matchIds(PAYMENT_OPTION_MATCH.cash, withVoucher)).toEqual([3]);
    expect(matchIds(PAYMENT_OPTION_MATCH.bank_transfer, withVoucher)).toEqual([1]);
    expect(matchIds(PAYMENT_OPTION_MATCH.card, withVoucher)).toEqual([2]);
  });

  // obrácený scénář: i kdyby v agendě "Cash" chybělo a zůstala jen dobírka,
  // "hotově" nesmí dobírku tiše přijmout — nulová shoda, ne špatná shoda.
  it("samotná 'Cash on delivery' bez 'Cash' dává nulovou shodu, ne špatnou shodu", () => {
    const onlyCod: Option[] = [{ Id: 4, Name: "Cash on delivery", Code: "D" }];
    expect(matchIds(PAYMENT_OPTION_MATCH.cash, onlyCod)).toEqual([]);
  });
});

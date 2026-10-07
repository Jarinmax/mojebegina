// ESHOP 1.0 — regrese 7. 10. 2026: živý read-only test (bod 3,
// feature/finance-1-0) proti skutečné agendě Beginy ukázal, že dřívější
// předpoklady (země "CZE", české názvy způsobů úhrady) v reálném API
// neplatí. Tenhle test ověřuje přímo PAYMENT_OPTION_MATCH a
// CZECH_REPUBLIC_COUNTRY_CODE (lib/eshop/invoicing/idoklad.ts) proti
// přesně té odpovědi, co agenda Beginy skutečně vrátila — bez DB/PGlite,
// čistá synchronní kontrola.
import { describe, expect, it } from "vitest";
import { CZECH_REPUBLIC_COUNTRY_CODE, PAYMENT_OPTION_MATCH } from "../invoicing/idoklad";

// Přesně odpověď GET /PaymentOptions z agendy Beginy (ověřeno živě 7. 10. 2026).
const BEGINA_PAYMENT_OPTIONS = [
  { Id: 1, Name: "Bank transfer", Code: "B", IsDefault: true },
  { Id: 2, Name: "Credit card", Code: "P", IsDefault: false },
  { Id: 3, Name: "Cash", Code: "H", IsDefault: false },
];

function matchIds(name: RegExp, options: typeof BEGINA_PAYMENT_OPTIONS) {
  return options.filter((o) => name.test(o.Name)).map((o) => o.Id);
}

describe("CZECH_REPUBLIC_COUNTRY_CODE — regrese CZE→CZ", () => {
  it("je ISO ALPHA-2 \"CZ\", ne dřívější chybné \"CZE\"", () => {
    expect(CZECH_REPUBLIC_COUNTRY_CODE).toBe("CZ");
  });
});

describe("PAYMENT_OPTION_MATCH — skutečná odpověď agendy Beginy (anglické názvy)", () => {
  it("bank_transfer najde právě 'Bank transfer', ne víc, ne nic", () => {
    const ids = matchIds(PAYMENT_OPTION_MATCH.bank_transfer.name, BEGINA_PAYMENT_OPTIONS);
    expect(ids).toEqual([1]);
  });

  it("card najde právě 'Credit card', ne víc, ne nic", () => {
    const ids = matchIds(PAYMENT_OPTION_MATCH.card.name, BEGINA_PAYMENT_OPTIONS);
    expect(ids).toEqual([2]);
  });

  it("cash najde právě 'Cash', ne víc, ne nic", () => {
    const ids = matchIds(PAYMENT_OPTION_MATCH.cash.name, BEGINA_PAYMENT_OPTIONS);
    expect(ids).toEqual([3]);
  });

  it("žádná metoda nekoliduje s jinou v reálné sadě (tři různé ID, žádné prázdné)", () => {
    const all = Object.values(PAYMENT_OPTION_MATCH).map((m) => matchIds(m.name, BEGINA_PAYMENT_OPTIONS));
    expect(all.every((ids) => ids.length === 1)).toBe(true);
    expect(new Set(all.map((ids) => ids[0])).size).toBe(3);
  });

  it("pořád funguje i na starší české názvy (zpětná kompatibilita s jinou agendou)", () => {
    const czechOptions = [
      { Id: 10, Name: "Převodem", Code: "B", IsDefault: true },
      { Id: 11, Name: "Kartou", Code: "K", IsDefault: false },
      { Id: 12, Name: "Hotově", Code: "H", IsDefault: false },
    ];
    expect(matchIds(PAYMENT_OPTION_MATCH.bank_transfer.name, czechOptions)).toEqual([10]);
    expect(matchIds(PAYMENT_OPTION_MATCH.card.name, czechOptions)).toEqual([11]);
    expect(matchIds(PAYMENT_OPTION_MATCH.cash.name, czechOptions)).toEqual([12]);
  });

  it("Code se nepoužívá jako rozhodující pole — karta má v Begině 'P', ne dřív předpokládané 'K'", () => {
    const card = BEGINA_PAYMENT_OPTIONS.find((o) => o.Id === 2)!;
    expect(card.Code).toBe("P");
    expect(matchIds(PAYMENT_OPTION_MATCH.card.name, BEGINA_PAYMENT_OPTIONS)).toEqual([2]);
  });

  it("nesouvisející způsob úhrady bez 'cash'/'kart'/'převod' v názvu nekoliduje", () => {
    const withVoucher = [...BEGINA_PAYMENT_OPTIONS, { Id: 4, Name: "Poukázka", Code: "V", IsDefault: false }];
    expect(matchIds(PAYMENT_OPTION_MATCH.cash.name, withVoucher)).toEqual([3]);
    expect(matchIds(PAYMENT_OPTION_MATCH.bank_transfer.name, withVoucher)).toEqual([1]);
    expect(matchIds(PAYMENT_OPTION_MATCH.card.name, withVoucher)).toEqual([2]);
  });

  // "Cash on delivery" (dobírka) obsahuje samostatné slovo "cash" — vzor ho
  // proto záměrně vyhodnotí jako nejednoznačné (2 shody), ne jako čistou
  // shodu jen na "Cash". To je bezpečné chování (stejný princip jako
  // "nejednoznačný způsob úhrady" v readOnlyCheck.test.ts): resolvePaymentOption
  // (issue.ts) na víc shod zastaví a nahlásí chybu, nikdy tiše nevybere.
  // Agenda Beginy dobírku nemá (ověřeno), ale kdyby ji měla, musí to být
  // vidět jako problém k ručnímu vyřešení, ne skrytá chyba.
  it("'Cash on delivery' vedle 'Cash' je záměrně nejednoznačné, ne tiše vybrané", () => {
    const withCod = [...BEGINA_PAYMENT_OPTIONS, { Id: 4, Name: "Cash on delivery", Code: "D", IsDefault: false }];
    expect(matchIds(PAYMENT_OPTION_MATCH.cash.name, withCod)).toEqual([3, 4]);
  });
});

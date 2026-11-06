import { describe, expect, it } from "vitest";
import {
  describeCall,
  groupByPragueDay,
  leadBackLink,
  parseContactSearch,
  parsePage,
  pragueDateLabel,
  pragueDayLabel,
  pragueTimeLabel,
} from "../callHistoryValidation";

describe("hledání kontaktu", () => {
  it("prázdný nebo jednoznakový dotaz nic nehledá", () => {
    expect(parseContactSearch(undefined)).toBeNull();
    expect(parseContactSearch(["a", "b"])).toBeNull();
    expect(parseContactSearch("  ")).toBeNull();
    expect(parseContactSearch(" x ")).toBeNull();
  });

  it("ořízne mezery, escapuje zástupné znaky a vytáhne číslice telefonu", () => {
    expect(parseContactSearch("  Kavárna   U Mostu ")).toEqual({ text: "Kavárna U Mostu", pattern: "%Kavárna U Mostu%", digits: null });
    expect(parseContactSearch("100%_\\")).toEqual({ text: "100%_\\", pattern: "%100\\%\\_\\\\%", digits: "100" });
    expect(parseContactSearch("+420 777 12")?.digits).toBe("42077712");
    expect(parseContactSearch("77")?.digits).toBeNull();
    expect(parseContactSearch("x".repeat(200))?.text).toHaveLength(80);
  });
});

describe("stránka a zpětný odkaz", () => {
  it("číslo stránky jen z číslic, jinak 0", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-1")).toBe(0);
    expect(parsePage("1e3")).toBe(0);
    expect(parsePage(undefined)).toBe(0);
  });

  it("zpět jen na známá místa, jinak CRM", () => {
    expect(leadBackLink("hovory")).toEqual({ href: "/prace/hovory", label: "← Hovory a kontakty" });
    expect(leadBackLink("prace").href).toBe("/prace");
    expect(leadBackLink("dnes").href).toBe("/rizeni-firmy/obchod/dnes");
    for (const raw of [undefined, "https://zle.cz", "__proto__", "toString"]) {
      expect(leadBackLink(raw)).toEqual({ href: "/rizeni-firmy/obchod", label: "← Obchod / CRM" });
    }
  });
});

describe("popis hovoru", () => {
  it("výsledek z Denního volání i posun fáze", () => {
    expect(describeCall({ callResult: "no_answer", stageChangedTo: "callback_later" })).toEqual({ resultLabel: "Nedovoláno", stageLabel: "Ozvat se později" });
    expect(describeCall({ stageChangedTo: null })).toEqual({ resultLabel: null, stageLabel: null });
    expect(describeCall(null)).toEqual({ resultLabel: null, stageLabel: null });
    expect(describeCall({ callResult: "neznamy" }).resultLabel).toBe("neznamy");
  });
});

describe("dny a časy v Praze", () => {
  const now = new Date("2026-11-06T10:00:00Z");

  it("seskupí po pražských dnech, i přes půlnoc UTC", () => {
    const rows = [
      { id: 1, createdAt: new Date("2026-11-05T23:30:00Z") }, // 6. 11. 00:30 Praha
      { id: 2, createdAt: new Date("2026-11-05T22:30:00Z") }, // 5. 11. 23:30 Praha
      { id: 3, createdAt: new Date("2026-11-05T08:00:00Z") },
    ];
    expect(groupByPragueDay(rows).map((g) => [g.day, g.items.map((r) => r.id)])).toEqual([
      ["2026-11-06", [1]],
      ["2026-11-05", [2, 3]],
    ]);
  });

  it("popisky dne, data a času", () => {
    expect(pragueDayLabel("2026-11-06", now)).toBe("Dnes");
    expect(pragueDayLabel("2026-11-05", now)).toBe("Včera");
    expect(pragueDayLabel("2026-11-02", now)).toBe("pondělí 2. 11. 2026");
    expect(pragueTimeLabel(new Date("2026-11-05T22:30:00Z"))).toBe("23:30");
    expect(pragueDateLabel(new Date("2026-11-05T23:30:00Z"))).toBe("6. 11. 2026");
  });
});
